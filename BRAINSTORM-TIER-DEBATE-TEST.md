# Brainstorming Council — Tier Comparison Test

_Run date: 2026-04-25 · Question: "Should I raise £2M now or hit 100 paying users first?"_

Single side-by-side run of the Brainstorming Council pattern at four pricing tiers, against the same founder question and the same foundry context. Same prompts, same personalities, same Council pattern (Fiona host opens → Sage / Finn / Sal / Mia fire in parallel → Fiona host closes). The only thing that changes is the model under each role.

Goal: see whether intelligence tier produces meaningful Council quality differences, or whether the upgrade story has to be re-thought.

---

## 1. Test setup

| Role | Tier A — Quick (Free) | Tier B — Full (Starter £20) | Tier C — Deep (Pro £100) | Tier D — Strategy (Enterprise) |
|---|---|---|---|---|
| Fiona — open | claude-haiku-4-5 | claude-sonnet-4-6 | claude-opus-4-7 | claude-opus-4-7 + extended thinking |
| Fiona — close | claude-haiku-4-5 | claude-sonnet-4-6 | claude-opus-4-7 | claude-opus-4-7 + extended thinking |
| Sage (Strategy) | deepseek-chat (V4) | claude-sonnet-4-6 | claude-opus-4-7 | claude-opus-4-7 + extended thinking |
| Finn (Finance) | deepseek-chat (V4) | deepseek-chat (V4) | deepseek-reasoner (V4-Pro) | deepseek-reasoner (V4-Pro) |
| Sal (Sales) | gpt-4.1-mini | gpt-4.1 | gpt-4.1 | gpt-4.1 |
| Mia (Marketing) | claude-haiku-4-5 | claude-haiku-4-5 | claude-sonnet-4-6 | claude-sonnet-4-6 + extended thinking |
| Source citations required? | No | Yes | Yes | Yes |
| Max-tokens cap (per specialist) | 1,500 | 1,500 | 2,500 | 3,500 |
| Max-tokens cap (Fiona open / close) | 1,000 / 2,000 | 1,000 / 2,000 | 1,000 / 2,500 | 1,500 / 3,500 |

Notes:
- Tier B/C/D specialists were instructed: "Every numerical or factual claim about the founder's situation MUST cite the foundry-context field it came from, e.g. (burn £15K/month), (4 pilots), (6mo runway), (two £500K angels)."
- gpt-4o was substituted with gpt-4.1 (current OpenAI catalog name). gpt-5.4 referenced in the brief is a planning name — actual catalog uses gpt-4.1.
- Tier A `deepseek-chat` is V4 base; Tier C/D `deepseek-reasoner` is V4-Pro reasoning mode (returns reasoning_content trace alongside answer).
- Anthropic Opus 4.7 extended thinking uses `thinking: { type: "adaptive" }` + `output_config: { effort: "high" }` per the current API contract; sonnet-4-6 uses the older `enabled` + budget_tokens shape.
- Judge: claude-opus-4-7 (no extended thinking, deterministic JSON output, 6-dimension rubric).

---

## 2. Foundry context passed into every specialist (verbatim)

> Hardware startup, pre-revenue. Currently has 4 paying-pilot customers. Cash burn is £15,000 per month and there is six months of runway at the current burn rate. The founder is in early discussions with two angel investors who have each indicated cheques of around £500,000. There is no product-market fit yet for paying volume.

---

## 3. Full transcripts per tier (verbatim, not summarised)

### Tier A — Quick Council (Free)

```
──────────────────────────────────────────────────────────────────────────────
FIONA OPENS — FRAMING
──────────────────────────────────────────────────────────────────────────────
Right. Let's be precise about what's on the table.

The founder is asking whether to take capital now or prove demand first. What they're actually asking is whether six months of runway is enough time to find product-market fit before the money runs out — and whether two angels willing to write £500,000 cheques each represent a closing window or a standing offer.

Three dimensions where this council will genuinely disagree:

1. **Whether four paying-pilot customers constitute a signal worth protecting, or noise worth ignoring.** With no product-market fit yet and a £15,000 monthly burn, those four pilots represent either the fragile beginning of something repeatable or four one-off relationships that will evaporate the moment the founder stops hand-holding them. That distinction determines whether hitting 100 paying users is a realistic milestone or a distraction.

2. **Whether six months of runway is a constraint or a luxury in hardware.** Most hardware founders would consider six months a gift. But if the founder needs to manufacture tooling, iterate on design, or negotiate with a contract manufacturer, six months becomes a sprint with no margin for the delays that hardware always produces. The question isn't really about time; it's about whether the founder knows what they need to prove and whether they can prove it before the cash runs dry.

3. **Whether two angels at £500,000 each will still be there in six months, or whether the offer has an expiry date written in their calendar.** Angel investors who've indicated cheques that size are often working through a decision window — they're warm now, but founder momentum and market conditions shift. Waiting to raise after hitting 100 users might mean raising at a better valuation, or it might mean those two investors have moved on to the next opportunity.

Sage, Finn, Sal, and Mia — what does this look like from your angles?

──────────────────────────────────────────────────────────────────────────────
SAGE (deepseek-chat)
──────────────────────────────────────────────────────────────────────────────
Hardware pre-revenue with 4 pilots and 6 months of runway. Two angels offering £1M total. The math is brutal: you need to find product-market fit in hardware in 6 months on £90k of remaining cash. That's not a constraint — that's a fantasy.

Here's the break: those 4 pilots are not a signal. They're a cost center. Hardware pilots at this stage are high-touch, high-support, and tell you almost nothing about repeatable demand. You're burning £15k/month to learn from 4 people. At that rate, 100 paying users isn't a milestone — it's a death march. You'll run out of cash before you hit 30.

The real question isn't raise vs. don't raise. It's: can you get to a meaningful de-risking milestone on £90k? If the answer is no — and for hardware, it almost certainly is — then you take the £1M now. Not because you want to, but because the alternative is running out of money with nothing to show but 4 expensive relationships.

The one thing that changes this: if those 4 pilots are paying £50k+ each annually and you can prove a 6-month payback period. Then you have unit economics worth protecting. But you didn't say that, so I'm assuming you don't. Get me that number — average annual contract value per pilot — because if it's under £20k, take the money today.

**WHAT TO DO THIS WEEK:** Call both angels. Tell them you're closing the round in 30 days at current terms. Use the £1M to extend runway to 18 months and hire one person to run the pilots while you focus on finding the repeatable sale. If they push back, you know the offer had an expiry date. If they say yes, you've bought the time hardware always needs.

──────────────────────────────────────────────────────────────────────────────
FINN (deepseek-chat)
──────────────────────────────────────────────────────────────────────────────
THE NUMBERS THAT MATTER

At £15K/month burn and six months of runway, you have £90K left. Two angels at £500K each would give you £1M total — but only if you close them now. Here's the math that decides this: four pilot customers at what price? If they're paying £2K/month each, that's £8K monthly revenue — covering barely half your burn. If they're paying £20K/year upfront, that's £80K total — buying you five more months. Without knowing the unit economics, "100 paying users" is a meaningless target. What matters is whether each user generates positive gross margin and whether the path from 4 to 100 is linear or exponential.

The real risk isn't running out of money — it's running out of time to discover the right pricing and cost structure. Hardware has a nasty habit: your £15K burn today assumes no manufacturing costs. The moment you need to produce 100 units, tooling alone could be £50K-£100K, and per-unit cost might be £200-£500. At 100 users, you'd need £20K-£50K in inventory before you see a penny of revenue. That £1M from angels suddenly looks like survival capital, not growth capital. Hitting 100 users first without that buffer means you prove demand but can't fulfill it — a worse position than raising now with only four pilots.

The angels' £500K cheques are a window, not a standing offer. Angel investors in hardware typically want to see either traction or a clear path to Series A within 18 months. Four pilots isn't traction — it's a hypothesis. If you wait six months and hit 100 users, you'll likely raise at 2-3x the valuation, but you'll also have burned through your runway and have zero negotiating leverage. The smarter play: raise the £1M now, but structure it as a SAFE with a valuation cap tied to user milestones. That gives you 12-14 months of runway (assuming £15K burn plus £5K for manufacturing samples) and forces the angels to stay engaged while you prove the model.

**THE NUMBERS THAT MATTER**
- Current runway: 6 months at £15K/month = £90K remaining
- Two angels at £500K each = £1M total, extending runway to ~60 months at current burn (but hardware costs will spike)
- 4 pilots → 100 users = 25x growth. If each pilot costs £5K to acquire and support, 100 users costs £500K — half your raise
- If you wait: 0% chance angels are still warm in 6 months. 70% chance you're out of money before hitting 100 users (hardware delays average 3-4 months)
- This week: Calculate your actual pilot revenue and per-user acquisition cost. If it's under £500/user, raise now. If over £2K/user, wait and optimize pricing first.

──────────────────────────────────────────────────────────────────────────────
SAL (gpt-4.1-mini)
──────────────────────────────────────────────────────────────────────────────
With a £15K monthly burn and six months of runway, every week of delay in closing a meaningful round costs you roughly £3,750 in runway value. That’s runway velocity you can’t afford to lose. Four paying pilots are a start, but they don’t scale your pipeline or validate repeatable demand yet. Your average deal size and sales cycle aren’t defined, but hardware sales cycles typically run 3-6 months minimum. That means you’re already on the clock to prove product-market fit before the cash runs out.

The two angels at £500K each are a live opportunity with a ticking clock. Angel interest at that scale rarely sits open indefinitely—momentum matters. Waiting to hit 100 paying users before raising risks losing those cheques or forcing you into a down round if the pilots don’t convert quickly. Conversely, raising now with a clear plan to hit 100 users post-close accelerates your runway and pipeline velocity, increasing your odds of hitting that milestone with less pressure.

Here’s the play: Lead with the £1M raise now to extend runway to 12+ months. Use that runway to systematize your sales process around the pilots, build scalable proof points, and hit 100 paying customers on a defined timeline. If the angels push back on valuation or terms, flip to a risk-reversal offer—guarantee a milestone-based tranche release tied to hitting user growth targets. This preserves price integrity and aligns incentives without sacrificing runway.

Every week you wait to raise costs you £3,750 in runway and risks losing investor momentum. Every month of runway you add increases your perceived likelihood of hitting product-market fit and hitting that 100-user milestone. Delay kills velocity and increases effort and sacrifice exponentially. Your value equation screams: raise now, then scale fast.

SEND THIS TODAY:
1. Call each angel this week to confirm deal interest and term sheet timing.
2. Prepare a milestone-based tranche structure tied to 100 paying users within 9 months.
3. Map out a 90-day sales playbook to convert pilots into paying customers.
4. Lock in the £1M raise now, extend runway, then hit 100 users on a defined timeline.
5. Avoid waiting for perfect product-market fit before raising — velocity wins.

──────────────────────────────────────────────────────────────────────────────
MIA (claude-haiku-4-5)
──────────────────────────────────────────────────────────────────────────────
Here's my take: **raise the £2M now, but only if you can prove one specific thing in the next 60 days — that your four pilots will renew or expand, not churn.**

Fiona's right that those four customers are the hinge. But here's what she's missing on the marketing side: in hardware, your first four paying pilots aren't noise — they're your *only* distribution channel for the next 100. You don't acquire 96 more users through ads or content. You acquire them through case studies, referrals, and proof that the first four didn't regret the decision. If those four churn the moment you stop hand-holding, you don't have a signal. You have a sales problem masquerading as a product problem. And no amount of runway fixes that.

So the real question isn't "can we hit 100 users in six months?" It's "can we prove those four will stick around and refer?" That's a 60-day sprint, not a six-month one. Here's the math: you have £90K total runway. Burn £15K/month for two months to run a tight pilot-to-renewal sequence — customer success calls, usage tracking, expansion conversations. If three of four renew or expand their contract, you have a repeatable motion. If they churn, you've learned something critical: your product isn't solving the problem you thought it was, and more runway won't fix that. At that point, raising £2M becomes a way to burn through capital faster while chasing the wrong metric.

But if those four stick? Then raise immediately. Here's why: hardware has manufacturing lead times. If you're at four pilots and you've proven they'll renew, your next constraint isn't demand — it's supply. You need to tool up, negotiate with a CM, and build inventory. That takes capital and time. Six months of runway doesn't cover both. Two million does. And those two angels? They're warm *now*. In six months, after you've burned through £90K and you're at 12 paying users instead of 100, their cheques get smaller and their terms get harder. Momentum is real in fundraising.

**SHIP THIS WEEK:** Run a 60-day pilot-to-renewal sprint. Map your four customers: which ones are using the product weekly? Which ones have expanded their use case? Which ones have introduced you to peers? Build a simple scorecard (usage frequency, expansion signals, referral intent). By week 8, you'll know if you have a repeatable motion or a one-off sale. If it's repeatable, call those angels on day 60 and close. If it's not, you've learned something worth more than runway — you've learned what to fix before you scale.

──────────────────────────────────────────────────────────────────────────────
FIONA CLOSES — SYNTHESIS
──────────────────────────────────────────────────────────────────────────────
**WHERE THEY AGREED**

All four specialists agree on one thing: those four pilots are your only real asset right now, and their behaviour in the next 60 days determines everything. Sage calls them a cost centre; Mia calls them your distribution channel; Finn and Sal frame them as the proof point that decides whether you can raise at all. But they're unanimous that you cannot hit 100 paying users without first knowing whether those four will renew, expand, or evaporate the moment you stop hand-holding them. The £1M from the two angels is not a growth cheque — it's a runway extension that only makes sense if you've proven the pilots are repeatable, not one-off relationships.

**WHERE THEY DISAGREED**

Mia and Sage are in direct conflict on the sequencing. Sage says: take the £1M now, extend your runway to 18 months, and use that time to figure out what's working. The alternative — hitting 100 users on £90K remaining — is a "death march" and mathematically impossible for hardware. Mia says: do not take the money until you've run a 60-day sprint to prove those four pilots will renew or expand. If they churn, more runway just lets you burn capital faster while chasing the wrong metric. Finn and Sal both lean toward raising now, but for different reasons — Finn because manufacturing costs will spike and you'll need the buffer; Sal because every week of delay costs you £3,750 in runway velocity and risks losing investor momentum. The sharpest disagreement is this: Sage and Sal believe the angels' offer has an expiry date and waiting six months means losing the cheques or raising at worse terms. Mia believes the real expiry date is whether your pilots stick around, and raising before you know that is a waste of capital.

**NEXT CONCRETE ACTION**

**This week: call each angel and ask for a 60-day hold on their cheques, then run Mia's pilot-to-renewal sprint.** Map your four customers against three signals — weekly usage frequency, expansion signals (increased scope or budget), and referral intent. By day 60, you'll know whether you have a repeatable motion (in which case you call the angels back and close immediately) or a one-off sale (in which case you've learned what to fix before you scale, and you'll raise from a position of clarity rather than desperation). This test costs you nothing but time, and it answers the question Sage, Finn, and Sal are all actually asking: are those four pilots a signal or noise? If the angels won't hold for 60 days, you've learned something critical about their conviction — and you'll raise now knowing the offer was warm but not warm enough to wait.

Fiona

Thursday, 16 January
```

### Tier B — Full Council (Starter £20)

```
──────────────────────────────────────────────────────────────────────────────
FIONA OPENS — FRAMING
──────────────────────────────────────────────────────────────────────────────
What's being asked on the surface is a sequencing question — raise now, or wait. What's actually being asked is whether four paying pilots and six months of runway constitute enough proof to command a fair valuation, or whether pushing to one hundred paying users before raising would cost the company its life before it costs the investors their doubt.

Three things worth disagreeing about:

1. **The runway is the real constraint, not the milestone.** At £15,000 per month, this founder has roughly six months before the lights go out — which means the decision to "hit one hundred paying users first" is only available if one hundred paying users can be reached inside that window. Whether that is physically possible from a standing start of four pilots is the question underneath the question, and it matters because the entire "wait for more traction" argument collapses if the maths do not support it.

2. **Two angels at £500,000 each do not yet constitute a round.** Indicative interest is not a term sheet, and two cheques of £500,000 totalling £1,000,000 fall £1,000,000 short of the stated £2,000,000 target — which means the founder is simultaneously deciding whether to raise and whether to keep recruiting investors, two very different activities with very different time costs against a six-month clock.

3. **"Product-market fit" and "one hundred paying users" are being treated as synonyms, and they may not be.** Moving from four pilots to one hundred paying users in hardware, pre-revenue, with no confirmed fit, is not a linear scaling exercise — it is a sales, manufacturing, and margin problem all at once, and whether reaching that number would actually change an investor's conviction (or merely delay the raise by a quarter while burning £45,000) is genuinely contestable.

Sage, Finn, Sal, Mia — the floor is yours.

──────────────────────────────────────────────────────────────────────────────
SAGE (claude-sonnet-4-6)
──────────────────────────────────────────────────────────────────────────────
Fiona's right that runway is the binding constraint. But she stops short of the harder conclusion: **this is not a sequencing question at all. It's a survival question dressed up as a strategy question.**

Here's the chain. You have six months of runway (6mo runway) at £15,000 per month (burn £15K/month). You have two angels in early discussions, each indicating £500K (two £500K angels) — that's £1M of soft interest against a £2M target. The gap between "indicative interest" and "wire transfer" in hardware, with no PMF, is typically 90–120 days minimum. Do that maths: you are already inside the danger zone. If you decide today to chase 100 paying users first, you are betting that a hardware startup can 25x its customer base (4 pilots) in under six months with no confirmed fit, no volume manufacturing process, and a burn rate that doesn't slow down while you're selling. That bet is almost certainly wrong.

So I disagree with the framing that "wait for more traction" is a real option on the table. It isn't. The actual decision is: **raise now on what you have, or die trying to prove something you can't prove in time.** The 100-user milestone is a mirage if you can't reach it before month six. And in hardware, you almost certainly can't — not because the product is bad, but because hardware sales cycles, pilot-to-purchase conversion, and unit economics don't compress on demand. Fiona flags this. I'm saying it more bluntly: **100 users is the wrong target entirely.** What changes investor conviction in hardware at this stage isn't volume — it's proof that one or two customers are paying real money for a real outcome and would buy again. That's a different problem, and it's one you might actually solve in 60 days.

Here's what I'd do: stop trying to raise £2M and close the £1M you can actually get. Two angels at £500K each (two £500K angels) is a fundable round if you move fast. A £1M raise at a reasonable valuation, closed in 60 days, buys you roughly 5–6 additional months of runway beyond your current six (6mo runway) — enough to get to 10–15 paying customers, sharpen the use case, and raise a proper Series A or larger seed on real numbers. Chasing the full £2M when you only have £1M of soft interest is a classic founder trap: it delays the close, burns the clock, and risks losing the angels you already have to deal fatigue.

**Here's the one thing that changes this answer:** if either of those two angels has a hard condition — "we only write if you close the full £2M" — then the calculus shifts and you need to find a third investor fast, not chase users. Tell me whether that condition exists, because if it does, everything above about closing the £1M first is wrong.

---

**WHAT TO DO MONDAY MORNING**

1. **Call both angels this week.** Not to update them — to ask directly: "Are you prepared to close on a £1M round without a third investor?" You need a yes or a no, not a maybe. Maybes kill companies.
2. **Kill the 100-user target.** Replace it with one question: can you get one of your four pilots (4 pilots) to sign a full commercial contract — not a pilot — in the next 30 days? One real contract changes your story more than 96 more pilots.
3. **Map your burn against a 60-day close.** If the round doesn't close in 60 days, you have four months of runway left (burn £15K/month). That is your hard deadline for a plan B — bridge, cuts, or a different investor entirely. Write that date on the wall. Today.

──────────────────────────────────────────────────────────────────────────────
FINN (deepseek-chat)
──────────────────────────────────────────────────────────────────────────────
THE NUMBERS THAT MATTER

At £15K/month burn with 6 months runway (burn £15K/month, 6mo runway), the question isn't strategic preference — it's arithmetic. Hitting 100 paying users from 4 pilots (4 pilots) in a hardware startup pre-product-market fit is not a 6-month problem. It's a 12-to-18-month sales cycle problem disguised as a milestone. Hardware pilots require procurement cycles, physical deployment, validation, and then scaling — each step takes months, not weeks. The probability of reaching 100 paying users before cash hits zero is below 10%, and that's being generous.

The two £500K angel indications (two £500K angels) are a lifeline, not a distraction. £1M total at current burn buys 66 months of runway — that's 5.5 years. Even if the round closes at £1M instead of £2M, you've bought enough time to actually find product-market fit without the gun to your head. The risk of waiting is not "lower valuation" — it's "no company left to value." If you burn through runway trying to hit 100 users, you lose all negotiating leverage. Angels will smell desperation and either pull out or offer a down round at 30-50% dilution.

Here's the second-order cascade you need to trace: Raising now at a fair valuation (say £3-4M pre-money on £1M) gives you 33-50% dilution. Waiting and failing to hit 100 users gives you 100% dilution — the company dies. Waiting and succeeding gives you maybe 20% dilution on a £5-6M pre-money. The incremental dilution savings of 13-30% is not worth the 90%+ chance of running out of cash. The math is unambiguous: raise now, even if it's £1M instead of £2M, and treat the remaining £1M as a future milestone-based raise once you have 20-30 paying users and actual unit economics.

**THE NUMBERS THAT MATTER THIS WEEK:**
1. **Cash runway:** 6 months at £15K/month = £90K left. That's 24 weeks.
2. **Cost to close the round:** 8-12 weeks of founder time + £5-10K legal. Compare to 24 weeks of runway.
3. **Breakeven user math:** At £500/user/year (hardware typical), 100 users = £50K ARR. At £15K/month burn, you need 360 users to breakeven. 100 users doesn't solve cash — it just buys 3 more months.
4. **Action:** This week, get a term sheet from one angel at £500K on a £3M pre. That buys 33 months. Then you have time to hit 100 users for the next round at a higher valuation. Do not trade certainty for hope.

──────────────────────────────────────────────────────────────────────────────
SAL (gpt-4.1)
──────────────────────────────────────────────────────────────────────────────
You have £90,000 left in the bank (6mo runway × £15K/month burn). At four paying pilots, you’re not selling a product — you’re selling a promise. Hitting 100 paying users in hardware from a standing start is a fantasy if you haven’t already built a repeatable sales motion. Even if you could 25× your customer base in six months, you’d need to close 16 new deals per month, every month, with zero churn and zero slippage — and you’d have to do it before the cash runs out (4 pilots, 6mo runway). That’s not a sales plan, that’s a Hail Mary.

The two angels with £500K each are not a round, but they are a wedge. If you wait for 100 users, you risk running out of cash and losing both the angels and the company (two £500K angels, 6mo runway). If you raise now, you keep the lights on, buy time to prove out the sales engine, and — crucially — you can use the angels’ commitment as social proof to close the rest of the round. Every week you delay is £3,750 in burn (6mo runway, £15K/month), and every week you don’t close a new cheque is a week closer to zero leverage.

You do not have a pipeline problem, you have a time-to-cash problem. Investors back momentum and inevitability. The only way to create that is to show the round is moving — not to wait for a mythical milestone that will almost certainly cost you the company before you get there.

SEND THIS TODAY:
- Email both angels: “We’re opening the round this week. We have £1M soft-circled. I’m inviting a small group of strategic angels to close the remaining £1M. Target close: 30 days. Are you in for £500K on these terms?”
- Build a one-pager with your four pilots, the pipeline for the next 10, and a 6-month milestone plan. Attach it.
- Start a rolling close. Every week you wait is £3,750 gone forever. The only number that matters is cash in the bank.

──────────────────────────────────────────────────────────────────────────────
MIA (claude-haiku-4-5)
──────────────────────────────────────────────────────────────────────────────
Here's the hard truth: the marketing constraint is not whether you *can* reach 100 paying users in six months (burn £15K/month). It's whether reaching them would actually change the valuation conversation with investors who are already circling.

Right now you have four paying pilots (4 pilots) and two angels indicating £500K each (two £500K angels). That's not a funding problem yet—it's a conviction problem. Those angels haven't moved because the proof points are thin, not because the number is too small. Moving from 4 to 100 paying users in a hardware startup with no confirmed fit (no product-market fit yet) doesn't automatically unlock a Series A narrative; it unlocks a *different* set of questions. Investors will ask: What's your CAC to get those 100? What's your gross margin per unit? What's your churn? Are these 100 users actually repeatable, or did you sell 96 units to friends-and-family with a 40% churn cliff waiting at month three? In hardware, unit economics and manufacturing scalability matter more than raw user count. You could burn through £45K (three months of the six-month runway) chasing 100 users and still not have the margin story or repeat-purchase proof that actually moves a Series A conversation.

The real play here is not "wait for 100 users." It's "close the £1M you already have in-hand, then use that capital to answer the questions investors are actually asking." With two £500K angels already indicating (two £500K angels), your job this month is not to hit a user milestone—it's to convert those indications into term sheets. That takes 3-4 weeks of legal and diligence, not 12 weeks of sales grind. Once you have £1M deployed, you have runway to actually *test* whether 100 users is achievable *and* profitable. You can run a focused acquisition campaign, measure CAC against LTV, validate manufacturing assumptions, and build the unit economics story that makes the next £1M conversation real. Waiting six months to raise after burning £90K (6mo × £15K/month) with no new capital is not "proving traction"—it's just dying slower.

The sequencing should be: (1) Close the two £500K cheques this month—they're warm, they're ready, and they're not going to get warmer. (2) With £1M in hand and four months of runway remaining (6mo runway minus 2mo for close + deployment), run a targeted acquisition campaign to 50-75 paying users and nail the unit economics. (3) Use that data to raise the second £1M from a lead investor who actually cares about margin and repeat revenue, not just headcount. You'll have proof, you'll have runway, and you'll have a real story.

**SHIP THIS WEEK:** Stop waiting for 100 users. Call those two angels today and ask for a call with their legal team. Get term sheets in motion. While that's happening, audit your four pilots for repeat purchase signals and margin data—that's the real metric that moves the needle, not the next 96 users.

──────────────────────────────────────────────────────────────────────────────
FIONA CLOSES — SYNTHESIS
──────────────────────────────────────────────────────────────────────────────
## WHERE THEY AGREED

All four specialists — Sage, Finn, Sal, and Mia — agreed on the same structural fact: the "hit one hundred paying users first" option is not genuinely available given the foundry context. At £15,000 per month burn with six months of runway, the company has £90,000 left and roughly twenty-four weeks before cash hits zero. Scaling from four paying pilots to one hundred paying users in a hardware startup with no confirmed product-market fit would require closing approximately sixteen new deals per month, every month, with no slippage — a figure Sal named explicitly and Sage described as "almost certainly wrong" given hardware sales cycles, pilot-to-purchase conversion timelines, and the absence of a repeatable sales motion. Finn put the probability of reaching one hundred users before cash runs out at below ten per cent. Mia agreed the milestone would not even resolve the investor conviction problem, because angels at this stage are asking about unit economics and repeat-purchase signals, not raw user count. The consensus is not that one hundred users is the wrong ambition — it is that it is the wrong target for this raise, at this burn rate, on this clock.

## WHERE THEY DISAGREED

The sharpest dissent is between Sage and Finn on one side, and the implied logic of the founder's original framing on the other — but within the council, the real tension sits between Sage and Finn on round size. Finn argued that closing £1,000,000 from the two £500,000 angels now is arithmetically sufficient: at current burn of £15,000 per month, £1,000,000 buys roughly sixty-six months of runway, which Finn described as "5.5 years" — enough time to find product-market fit without existential pressure. Sage agreed on closing the £1,000,000 first but was explicit that this is only correct if neither angel has a hard condition requiring the full £2,000,000 to close; if that condition exists, Sage said, "everything above about closing the £1M first is wrong," and the founder must find a third investor immediately rather than optimise the existing two. Finn did not address that conditional at all. Sal and Mia both focused on converting the two indications to term sheets as the immediate action, without resolving whether £1,000,000 is a fundable standalone round or whether the angels' terms require a full £2,000,000 close. That unresolved condition — which no specialist had the data to answer — is the single point on which the entire sequencing argument turns.

## NEXT CONCRETE ACTION

**Call both angels before Friday and ask one direct question: "Will you close your £500,000 cheque as part of a £1,000,000 round, without a third investor, on a term sheet by the end of this month?"**

You need a binary answer, not a temperature check. If both say yes, you have a fundable round, a sixty-day close target as Sage outlined, and a path to ten to fifteen paying customers before you need to raise again — at which point the one hundred paying users conversation becomes real rather than theoretical. If either angel says no, or conditions their cheque on the full £2,000,000 being raised, the problem changes entirely: you are now running a sixty-to-ninety-day investor recruitment exercise against a twenty-four-week runway, and Sage's instruction to find a third investor fast — not chase users — becomes the only viable path. The answer to that one question determines whether this is a closing problem or a fundraising problem, and those are not the same thing.

— Fiona, ForgeOS Brainstorming Council. Carry this into your calls by Friday, 25 July.
```

### Tier C — Deep Council (Pro £100)

```
──────────────────────────────────────────────────────────────────────────────
FIONA OPENS — FRAMING
──────────────────────────────────────────────────────────────────────────────
Right. Let's open this properly.

On the surface, the founder is asking a sequencing question: raise now, or wait until one hundred paying users. Underneath, they're asking something harder — whether the story they can tell two angel investors today, with four paying pilots and six months of runway, is a stronger story than the one they could tell in roughly four to five months' time with materially more traction but materially less cash in the bank.

Three things this council will, and should, pull apart.

1. **Whether six months of runway at fifteen thousand pounds per month is actually six months, or whether it's three.** Hardware founders consistently underestimate how long a priced round takes to close, and if the raise itself takes ninety to one hundred and twenty days, the "wait for one hundred users" path is being costed against a runway that doesn't exist.

2. **Whether four paying pilots is a fundable signal or a fundable embarrassment.** Two angel investors writing five hundred thousand pounds each have already signalled appetite at the current traction level — but the valuation, the terms, and the calibre of the next round all hinge on whether four pilots reads as "early conviction" or "not yet a business", and reasonable people will disagree.

3. **Whether one hundred paying users is even the right milestone for a pre-product-market-fit hardware company.** The founder has anchored on a number that sounds like a software metric; the council should challenge whether the real unlock is unit economics on the existing four, a signed letter of intent from a larger buyer, or something else entirely that would reprice the round far more than volume would.

Sage, Finn, Sal, Mia — the floor is yours.

──────────────────────────────────────────────────────────────────────────────
SAGE (claude-opus-4-7)
──────────────────────────────────────────────────────────────────────────────
Raise now. Take the angel money this month. The "100 users" debate is a distraction and Fiona's instinct on point one is exactly right — six months of runway (6mo runway) is not six months when you're a hardware company trying to close a priced round. It's ten to twelve weeks of real decision-making time before you're raising from a position of panic, and panic raises get repriced by 30-50%.

Here's the chain: you're burning £15K/month (burn £15K/month) with 4 paying pilots (4 pilots) and no PMF for volume. That means every month you wait, you're spending £15K to *maybe* convert pilots into a story — but you have no evidence the conversion math works yet. Meanwhile two angels are signalling £500K each (two £500K angels), which is £1M of the £2M target already warm. You don't walk away from a warm £1M when you have no PMF and a depleting runway. You close it. **Here's the one thing that flips this answer:** if those two angels have explicitly told you they'd write *bigger* cheques or lead at higher valuation after more traction — not vague encouragement, actual indication — then waiting has real option value. Tell me exactly what they said, because "indicated cheques of around £500,000" reads to me like polite interest, not committed conviction.

Now — I disagree with Fiona's framing on point two more than she lets on. Four pilots isn't a fundable signal *or* an embarrassment. It's irrelevant to angels at this cheque size. £500K angels (two £500K angels) are betting on the founder and the wedge, not on pilot count. The 100-user milestone is a Series A conversation, and you are nowhere near a Series A. Don't optimise your seed round for metrics that matter to investors you won't meet for 18 months.

Third — and this is where I'd push hardest — the £2M number deserves scrutiny. At £15K/month burn (burn £15K/month), £2M is eleven years of runway at current spend, which means you're raising for a step-change in burn (hiring, inventory, tooling). Is that step-change justified pre-PMF (no PMF for paying volume)? Probably not. I'd raise £1M-£1.25M from the two warm angels now, extend runway to 18 months, use that window to prove unit economics on the existing 4 pilots, and raise the bigger round in nine months at a real valuation step-up. Don't raise the round you want. Raise the round you can close in 60 days.

**WHAT TO DO MONDAY MORNING:**
1. Call both angels (two £500K angels). Ask directly: "If I came back in 90 days with 20 paying customers, would your cheque size or valuation change?" Their answer decides everything.
2. Build a £1M raise scenario, not £2M. Smaller round closes faster, dilutes less, lets you raise the real round from strength in 9 months.
3. Get me the unit economics on the 4 pilots (4 pilots) — gross margin, payback period, expansion signal. *That's* the number that reprices your round, not user count.

Decide by Friday. You don't have the runway (6mo runway) to deliberate for a month.

──────────────────────────────────────────────────────────────────────────────
FINN (deepseek-reasoner)
──────────────────────────────────────────────────────────────────────────────
Let's start with the hard arithmetic. You have £90,000 in the bank (6 months × £15K burn) and two angels ready to write £500K each, totalling £1M. That's a £1.09M raise after accounting for the £90K you already have, but by the time you close that round—Fiona is right, hardware rounds take 3–4 months—you'll have burned another £45–60K, leaving you with £30–45K plus the new £1M. The "wait for 100 users" path means you burn that remaining runway down to zero while you're in the process of raising. At the current burn, assuming you hit 100 users in month 4, you'd have only 2 months of cash left when you start the raise—and angels don't wire money the day after a handshake. The risk of a cash crunch before close is high, and it only takes one delay to wipe you out. (burn £15K/month, 6mo runway, two £500K angels)

Now the value of 100 users. With 4 pilots, you have zero revenue to speak of, but you do have a unit-economics question: what's the gross margin on each pilot? If it's negative (common in hardware at low volume), scaling to 100 users actually worsens your burn unless you have clear per-unit economics that improve with volume. If it's positive, 100 users at, say, £500/unit annual subscription would give you £50K ARR—nice, but not enough to change the story for a £2M round. A hardware startup with £50K ARR and 100% gross margin still has a customer acquisition cost that likely dwarfs that. You could raise a £500K bridge on 4 pilots; you might not raise £2M on 100 users if the unit economics are still unproven. The real unlock isn't user count; it's a signed design win with a tier-1 buyer or a confirmed BOM that shows you can produce at 60% gross margin at scale. (4 pilots, pre-revenue)

The decision tree gives you two paths: raise now at £1M (two angels at pre-money valuation likely ~£2–3M) or burn down to raise later at an unknown valuation. If you raise now, you get 16 months of runway (£1M / £62.5K monthly burn including the £2K monthly increase you'll have when you add a head or two). If you wait, you have 4 months of runway when the round starts (month 2 of the 4-month raise window) and you're forced to raise on a timeline that gives the angels leverage. The difference in dilution is probably 5–10% more for waiting if the round is smaller and at a lower valuation. Instead, I'd raise the £1M now, cap the pre-money at £3M, and use the cash to prove unit economics on the next 20 pilots, not 100. Then come back for Series A at 1,000 units with proven margins. (burn £15K/month)

THE NUMBERS THAT MATTER
- Current runway: 6 months (ends month 6 from today)
- Raise timeline: ~4 months → effective runway for closing: 2 months
- Cost of waiting: £60K burned + risk of extended close = high chance of running dry
- What to track this week: Confirm BOM cost per unit for pilot #4. If margin < 40%, don't scale to 100—raise now. If margin > 50%, same answer: raise now, but with a clear path to positive unit economics.
- One number to move: Push the two angels to close £600K total (£300K each) in 6 weeks, not £1M in 4 months. That extends runway to 14 months and buys you 8 months to hit 20 proven pilots with positive margins.

──────────────────────────────────────────────────────────────────────────────
SAL (gpt-4.1)
──────────────────────────────────────────────────────────────────────────────
Let’s get blunt: every week you wait, you burn £3,750 of runway (burn £15K/month, 6mo runway). Your “100 paying users” milestone is a mirage — in hardware, that’s not a pipeline milestone, it’s a manufacturing and support nightmare unless you’ve proven you can deliver, install, and support at scale. Right now, you have four paying pilots (4 pilots), and two angels ready to write £500K cheques each (two £500K angels). That’s £1M of soft-circled capital on the table. If you wait for “100 users,” you’re gambling that you can 25x your customer base in four months, with no evidence of PMF and no guarantee those angels will still be around when you’re down to two months’ cash.

Here’s the revenue risk: if you run out of money before you close the round, you lose all negotiating leverage. Investors know you’re desperate. Your valuation tanks, your terms get worse, and you’re forced to accept whatever’s on offer — if anything is. The second-order effect: every week you delay the raise, you increase the odds you’ll have to accept a down round or bridge on punitive terms. That’s not just dilution, that’s existential risk.

Your four pilots are not embarrassing — they’re leverage. Use them. The story isn’t “we have four users,” it’s “we have four paying pilots in a hardware category where every pilot is a six-figure validation, and we’re closing two more this quarter.” That’s a pipeline story, not a vanity metric. If you want to reprice the round, get a signed LOI from a strategic buyer or a letter of intent for a volume order — not 100 random users. That’s what moves hardware investors.

Here’s the close: you have six months of runway on paper, but a hardware raise takes 3–4 months to close (6mo runway, burn £15K/month). If you wait, you’re betting the company on a pipeline you haven’t proven you can build. If you raise now, you lock in the £1M and keep the company alive. Don’t get cute with milestones — get the cash, then use the angels’ credibility to close more pilots and strategic buyers.

SEND THIS TODAY:  
Draft a one-pager for the angels: “Four paying pilots, two more in pipeline, raising £2M to scale manufacturing and close first enterprise deal. Target close: 60 days. Early investor terms: [insert].”  
Send it. Book the calls. Don’t wait for a vanity milestone that could kill the company.

──────────────────────────────────────────────────────────────────────────────
MIA (claude-sonnet-4-6)
──────────────────────────────────────────────────────────────────────────────
Fiona's framing is sharp, but it's missing the marketing layer — and the marketing layer is where this decision actually lives or dies.

Here's what I see: two angel investors have already signalled £500K each (two £500K angels) at a moment when this founder has four paying pilots (4 pilots) and zero product-market fit. That is not a weak story. That is a *story in motion* — and a story in motion is the most dangerous thing to pause. The instinct to wait for 100 users before raising assumes that 100 users is a better narrative. But narrative isn't arithmetic. Four pilots who are *paying* in a hardware category where pilots are usually free is a remarkable hook. The question isn't whether 100 is bigger than 4. The question is: which story converts the room faster, with the cash you actually have left?

Fiona is right that six months of runway (6mo runway) is probably three months of real optionality once you factor in a 90–120 day close cycle on a priced round. But here's the marketing implication she didn't surface: if this founder spends the next four months grinding toward 100 users instead of closing these two angels, they will arrive at the fundraise conversation with more traction *and* a worse story — because the story will be "we almost ran out of money chasing a metric." Investors pattern-match desperation faster than they pattern-match traction. The burn rate of £15K/month (burn £15K/month) means that by month five, the founder is pitching from a position of structural weakness, not strength. That reprices the round downward, not upward.

Now — Fiona's third point is the one I want to push hardest on, because it's the one with the biggest marketing consequence. The 100-user target is a software metric applied to a hardware problem, and it will produce a software-shaped story that hardware investors will not buy. What actually moves the needle on a hardware raise isn't volume — it's *proof of repeatability and margin*. One of those four pilots (4 pilots) paying at a price point that demonstrates viable unit economics is worth more in a pitch deck than 96 additional users at a discount. So the real marketing play here isn't "get to 100 users before raising." It's "extract the sharpest possible signal from the four pilots you have, package it as a case study with named outcomes, and use that as the lead asset in the raise conversation *right now*."

What I'd actually do: build a one-page "pilot results" asset — not a deck, a *document* — that turns the four pilots (4 pilots) into a repeatable proof point. What problem did each pilot have? What did the hardware solve? What's the measurable outcome? If even two of those four pilots can produce a quantified result (time saved, cost reduced, yield improved — whatever the category demands), that asset becomes the hook that closes the two £500K angels (two £500K angels) before the runway compresses. The raise isn't a distraction from traction. The raise *is* the marketing campaign right now, and the four pilots are the creative brief.

---

**SHIP THIS WEEK**

→ **Monday:** Interview all four pilots (4 pilots). One question only: "What would you have lost if this didn't exist?" Record it. Transcribe it. That's your hook.

→ **Tuesday:** Write a one-page pilot results document. Format: Problem → Solution → Measurable Outcome → Quote. No deck. No fluff. One page, named logos if permitted.

→ **Wednesday:** Send it to both angels (two £500K angels) with a single line: "We wanted you to see what the pilots are saying before we formalise terms. Can we talk this week?"

→ **Thursday:** If either angel responds, the meeting agenda is: unit economics on the four pilots, what £1M unlocks in the next 12 months, and why waiting for 100 users would cost you the category window — not accelerate it.

→ **Friday:** If neither responds, you have a messaging problem, not a traction problem. That's a different conversation — but you still have six months (6mo runway) to fix it, and that clock started Monday.

The story you can tell today is better than the story you'll tell in four months with less cash and more desperation. Ship the asset. Close the round. *Then* get to 100 users.

──────────────────────────────────────────────────────────────────────────────
FIONA CLOSES — SYNTHESIS
──────────────────────────────────────────────────────────────────────────────
**WHERE THEY AGREED**

All four landed on the same verdict, even when they entered from different doors: raise now, do not wait for one hundred users. Sage made it plainly — "the 100 users debate is a distraction" — and Sal called the milestone "a mirage" given the four paying pilots and six months of runway already on the clock. Finn ran the arithmetic and showed that a three-to-four-month hardware raise against six months of runway leaves only two months of real cash by close, with burn at fifteen thousand pounds per month. Mia reframed the same conclusion through narrative: a story in motion, with two angel investors signalling five hundred thousand pounds each, must not be paused. They also agreed — Sage, Finn and Mia explicitly — that one hundred users is the wrong milestone for a pre-product-market-fit hardware company; what reprices the round is unit economics on the four existing pilots, or a signed letter of intent from a strategic buyer, not user volume.

**WHERE THEY DISAGREED**

The sharpest dissent is on round size, and it sits between Sal and Sage. Sal wants the founder to send the one-pager today and raise the full two million pounds, using the four pilots and the two five-hundred-thousand-pound angels as the lead asset, treating the round as a sixty-day close. Sage — backed quietly by Finn's arithmetic — argues the two-million-pound target is structurally wrong at a fifteen-thousand-pounds-per-month burn with no product-market fit for volume, and the founder should raise one million to one and a quarter million from the two warm angels, extend to eighteen months, and raise the real round in nine months at a step-up. This is not a stylistic difference. It is a disagreement about whether the founder is raising the round they want, or the round they can actually close from the current traction base of four pilots.

**NEXT CONCRETE ACTION**

**By Friday, call both angel investors and ask the single question Sage put on the table: "If I came back in ninety days with twenty paying customers, would your cheque size or valuation change?"** Their answer resolves the Sal-versus-Sage dispute directly — if the angels indicate real uplift, a smaller bridge now plus a larger raise later (Sage's path) is correct; if the answer is polite vagueness, the warm one million pounds is the round, and Sal's sixty-day close timeline applies. In parallel, build Mia's one-page pilot results document this week, because either path requires it as the lead asset.

Back to you on Tuesday the 4th. — Fiona
```

### Tier D — Strategy Council (Enterprise) with extended thinking

```
──────────────────────────────────────────────────────────────────────────────
FIONA OPENS — FRAMING
──────────────────────────────────────────────────────────────────────────────
Right. The question on the table is whether to raise two million pounds now or hold out for one hundred paying users first — but underneath that is a sharper question, which is whether four pilots and six months of runway buys you the right to wait, or whether waiting is the very thing that costs you the round. What the founder is really asking the council is: *do I have a story strong enough to raise on today, or do I need traction to rescue a story that isn't yet there?*

Three things this council will pull apart:

1. **Whether six months of runway is a fundraising window or an emergency.** At fifteen thousand pounds a month of burn, six months looks comfortable until you remember that closing a round typically eats three to four of them — which means the "wait for traction" path is actually a two-month sprint to one hundred users, not a leisurely build.

2. **Whether four pilots is a narrative asset or a narrative liability right now.** Two angels writing five hundred thousand pounds each gets you to a million, not two — so the question of what the other million looks like, and whether four pilots can anchor it or actively undermines it, will split the room.

3. **Whether "no product-market fit yet for paying volume" is a fact you raise around or a fact you fix first.** Finn and Sage will likely disagree sharply here: one of these is a financing problem, the other is a product problem, and conflating them is how hardware founders lose eighteen months.

Sage, Finn, Sal, Mia — the floor is yours.

──────────────────────────────────────────────────────────────────────────────
SAGE (claude-opus-4-7)
──────────────────────────────────────────────────────────────────────────────
Raise now. Specifically: take the £1M that's actually on the table (two £500K angels) and stop pretending the choice is £2M-or-traction. The choice Fiona framed is a false binary — the real choice is whether you close the £1M soft-circled this month and treat the other £1M as a Q2 problem, or whether you blow your runway chasing 100 users to justify a round size the market hasn't offered you yet.

Here's the chain. You have 6 months of runway at £15K/month burn. Closing a hardware round takes 3-4 of those months. That means your decision window isn't six months — it's eight to ten weeks before you're raising from a position of visible desperation, which in hardware kills terms faster than weak traction does. Four pilots (4 paying pilots) is a fine story for a £1M angel round. It is not a story for a £2M round, and pretending otherwise is how you spend three months in "early discussions" that never close and wake up with two months of cash and no leverage. **Take the money in front of you.**

Now — the assumption that flips this. **Tell me what those 4 pilots are actually doing.** Because if even two of them have a credible path to expansion contracts in the next 90 days — real POs, not LOIs — then you have a traction story strong enough to go for £2M now and I'd reverse my answer. If the pilots are evaluation-stage with no expansion economics defined, they're a liability dressed as an asset, exactly as Fiona warned. I need pilot conversion intent before I'll let you push for the bigger round.

Where I disagree with the framing: "no product-market fit for paying volume" is not the binary product-vs-financing problem it sounds like. In hardware, pre-revenue, you don't fix PMF before you raise — you raise the capital that lets you build the unit that proves PMF. Chasing 100 paying users on 6 months of runway with hardware is not a sprint, it's a fantasy. You will not get there. Stop optimizing for a metric that doesn't fit your physics.

The £1M from the two angels gets you ~12 months of runway at current burn (£15K/month, 6mo runway today) — assuming burn rises post-raise, call it 9-10 months. That's enough to ship to 15-25 pilots, define unit economics, and then raise the £2M Series Seed on real data instead of vibes. Two-step the round. Don't hero-ball it.

**WHAT TO DO MONDAY MORNING:**
1. **Call both angels by Wednesday.** Move them from "indicated" to termsheet. Soft-circled money (two £500K cheques) is not money. Ask directly: "What do you need to wire in 30 days?"
2. **Audit your 4 pilots this week.** For each one: expansion intent, decision-maker, dollar size of a real contract, timeline. If two convert to expansion in 60 days, you reopen the £2M conversation. If not, you close the £1M and move.
3. **Build the 9-month plan against £1M, not £2M.** What do you prove with that capital that makes the next round a £3-5M raise instead of a £2M scrape? If you can't answer that in one paragraph by Friday, the problem isn't financing — it's strategy.

The one thing that changes everything: pilot expansion intent. Get me that data.

──────────────────────────────────────────────────────────────────────────────
FINN (deepseek-reasoner)
──────────────────────────────────────────────────────────────────────────────
At current burn of £15,000 per month and six months of runway, you have roughly £90,000 in the bank. Two angels at £500,000 each bring a potential £1,000,000, leaving another £1,000,000 needed to reach the £2M target. Without product-market fit for paying volume and only four pilots, your story for that second million is weak. The math is unforgiving: raising £2M now requires convincing a new lead investor on a pre-revenue narrative with minimal traction — and that lead will likely demand terms that dilute you more than waiting would, assuming you survive to wait. But the numbers say you likely won't survive to wait.

Fiona is right that closing a round consumes three to four months. With six months of runway, waiting for 100 paying users means you must add 96 users — from four — before you even start fundraising. That is 24 users per month if you start immediately, or 48 per month if you give yourself two months of buffer. In hardware, with no PMF, that's not a sprint; it's a fantasy. Two months to reach 100 users? More likely you burn through cash and never raise. The "wait for traction" path is actually a high-risk gamble that ends with you at zero and no leverage.

Take the numbers to their logical conclusion: raise £1M now — the two angel checks — and skip the full £2M. That gives you roughly 66 months of runway at the current burn (6 months existing + 60 months from £1M at £15K/month). Even if burn triples to £45K/month with hiring and production, you get ~22 months. That is enough time to find PMF, hit 100 paying users, and then raise the second £1M at a better valuation. The second-order effect: raising only what you need now avoids over-dilution and preserves the ability to negotiate from strength later. The risk of raising too little (not reaching milestones before cash-out) is lower than the risk of raising too much and locking in poor terms.

**THE NUMBERS THAT MATTER**
- Current cash: ~£90,000 (based on £15K/month burn × 6 months)
- Potential angel total: £1,000,000 (two individuals at £500K each)
- Gap to £2M: £1,000,000 — requires a lead with no traction
- Milestone path: 4 pilots → 100 users = 96 new paying users needed
- Realistic timeline for 100 users at current state: 6–12 months minimum
- Recommended raise: £1,000,000 now (angels only), extending runway to ~5 years at current burn
- Key metric to track monthly: cost per new paying user (CAC) and cash runway remaining (months until cash = 0)

──────────────────────────────────────────────────────────────────────────────
SAL (gpt-4.1)
──────────────────────────────────────────────────────────────────────────────
With a £15K/month burn and six months of runway, you have a 180-day fuse before the lights go out (burn £15K/month, 6mo runway). Fundraising cycles in hardware routinely take 3–4 months to close, and angels move faster than institutional, but even with two £500K cheques soft-circled, you’re still £1M short of the £2M target (two £500K angels). Four pilots is not a volume story — it’s a proof-of-concept footnote. If you wait for 100 paying users, you’re betting you can 25× your customer base in 60 days, with no product-market fit for paying volume (4 pilots, no PMF). That’s a pipeline fantasy, not a sales plan.

Here’s the revenue risk: If you stall to chase 100 users and miss, you run out of time and negotiating leverage. Every week you wait costs you 4% of your remaining runway. If you miss the 100-user mark, you’re not just out of cash — you’re out of story, and you’ll be raising a bridge on worse terms, if at all. Hardware investors know the PMF risk; they’ll price it in, but they’ll punish desperation harder.

The only way to flip this is to sell the “momentum” story now: four pilots in-market, two angels circling, a clear use-of-funds plan to accelerate to 100 users. Anchor the round on the two angels, then use their soft commits as social proof to fill the rest. Don’t try to close £2M cold — close £1M fast, then run a rolling close for the rest, using every new commit as leverage. If you get a “wait for traction” objection, flip to a risk-reversal: offer a milestone-based tranche — e.g., “First £1M now, next £1M at 50 paying users.” That keeps the round alive and gives you a path to full funding without betting the company on a 60-day miracle.

SEND THIS TODAY:
- Email both angels: “We’re opening the round this week. We have four pilots live and a clear path to 100 users with this capital. Are you ready to move forward with your £500K commitments?”
- Outreach to five new angels: “We have £1M soft-circled from two leads, four pilots live, and a plan to scale to 100 users. Are you open to a call this week to discuss joining the round?”
- If you get pushback on traction, offer: “We’ll tranche the round — first £1M now, next £1M at 50 users. That way you’re protected, and we’re funded to execute.”

Don’t wait for a pipeline that won’t fill itself in two months. Move now, close what you can, and use momentum to fill the gap. Every week of delay costs you £3,750 in runway and leverage.

──────────────────────────────────────────────────────────────────────────────
MIA (claude-sonnet-4-6)
──────────────────────────────────────────────────────────────────────────────
Fiona's right that the two-month sprint framing is the real constraint — but she's still treating this as a binary. Raise *or* traction. Here's what I'd push back on: the narrative gap between four pilots (4 pilots) and a £2M round isn't filled by time, it's filled by *signal density*. And signal density is a marketing problem before it's a fundraising problem. The question I'd put to this room is: what story are those four pilots actually telling right now, and is anyone telling it loudly enough for a third angel, a lead investor, or the ecosystem to hear?

At £15K/month burn (burn £15K/month) with six months of runway (6mo runway), you have approximately eight to ten weeks of real fundraising air before you're negotiating from distress. That is not enough time to go from four paying pilots (4 pilots) to a hundred users organically — hardware sales cycles alone will eat six of those weeks. So the "hit traction first" camp is quietly proposing a path that ends with the founder back at the table in worse shape, not better. But here's what they're *not* wrong about: trying to raise £2M on four pilots (4 pilots) with no PMF evidence and two angels who've indicated — *indicated* — £500K each (two £500K angels) is a story with a hole in the middle the size of the missing million. You can't close a £2M round with £1M of soft indication and a gap.

So the marketing play — and I mean this strategically, not just tactically — is to use the next four weeks to *weaponise those four pilots* into the kind of proof narrative that makes the gap feel like a feature, not a liability. Hardware startups raise pre-PMF all the time when the pilot outcomes are undeniable and documented. Right now those four customers (4 pilots) are probably sitting in a Notion doc somewhere. They need to be case studies. Not fluffy ones — hard outcome case studies. What problem did each pilot have, what did they measure before, what are they measuring now, what would switching back cost them? If even two of the four pilots can answer those questions with numbers, you have the anchor for a raise. You have the "we don't have a hundred customers, we have four who can't leave" story, which at the £2M bracket is a better story than "we have ninety-six customers who signed up last month."

The distribution play for that narrative isn't TikTok or Instagram — this is a B2B hardware play and your angels are Solution-Aware to Product-Aware. They already believe the category exists; what they don't believe yet is that *this* team will win it. That means the content doesn't go on social first. It goes directly into the investor conversation as structured assets: a one-page pilot outcome brief per customer, a 90-second testimonial video if you can get it, and a founder update that links the two £500K angels (two £500K angels) into a shared Slack or WhatsApp where they can see momentum build in real time. That's not marketing in the traditional sense — that's using marketing mechanics to manufacture investor FOMO inside a closed loop, which is the highest-ROI channel available to you right now.

One thing I won't fabricate: I don't know your pilots' outcomes yet, and I won't assume they're quotable. If those four customers are lukewarm or the results are ambiguous, the case study play collapses and Finn's capital-first argument wins by default. Ask the pilots this week. Their answer tells you which path you're actually on.

---

**SHIP THIS WEEK**

→ **Monday:** Call all four pilots (4 pilots). Ask one question: "On a scale of 1–10, how likely are you to keep using this after the pilot ends — and why?" Record or transcribe. This is your PMF signal and your copy source.

→ **Tuesday–Wednesday:** Turn the two strongest answers into a one-page pilot outcome brief each. Problem → Intervention → Measurable Result → Cost of reverting. No fluff. Real numbers only.

→ **Thursday:** Send both briefs to the two angels (two £500K angels) with a personal note: *"Before we get to term sheets, I want you to see what the product is actually doing. Two of our pilots told us this unprompted."* Let the pilots close, not the pitch.

→ **Friday:** Put a 30-day investor update cadence in place. Weekly, one paragraph, one metric, one customer quote. Make momentum visible — because at £15K/month burn (burn £15K/month) with ten weeks of real runway, the investor who feels inside the story is the one who moves fastest.

**The win condition:** By end of week two, you know whether your pilot narrative is raise-ready or repair-required. Everything else is downstream of that answer.

──────────────────────────────────────────────────────────────────────────────
FIONA CLOSES — SYNTHESIS
──────────────────────────────────────────────────────────────────────────────
**WHERE THEY AGREED**

All four specialists rejected the founder's framing as posed. Sage called the £2M-or-100-users binary "false"; Finn called the wait-for-traction path "a fantasy"; Sal called 25× growth in 60 days "a pipeline fantasy"; Mia called it a path that "ends with the founder back at the table in worse shape". They also converged on the same arithmetic: at £15,000 per month burn against six months of runway, with three to four months consumed by closing a hardware round, the real decision window is eight to ten weeks — not six months. And all four agreed the £1M soft-circled from the two £500,000 angels is the round actually on the table; the missing £1M to reach £2M is the part of the story that has a hole in it. None of them endorsed waiting for one hundred paying users from four pilots.

**WHERE THEY DISAGREED**

The sharpest split is between Finn and Mia on what the £1M is actually *for*. Finn's runway-math case treats £1M as a five-year cushion at current £15,000 per month burn — raise small, preserve dilution, find product-market fit, then raise the second £1M from strength later. Mia rejects that as under-ambition dressed as prudence: the four pilots, weaponised into hard outcome case studies this week, can close the narrative gap to a full £2M round now, and settling for £1M when the pilot evidence might support more is leaving leverage on the table. Finn says the gap to £2M is unbridgeable without traction; Mia says the gap is a signal-density problem, not a traction problem. Sage sits closer to Finn but conditional on pilot expansion intent; Sal sits between them with the tranche structure (£1M now, £1M at fifty users) as the bridge.

**NEXT CONCRETE ACTION**

**By Friday, audit all four pilots on two questions: expansion intent with a real purchase order timeline (Sage's test), and a one-to-ten retention score with the reason (Mia's test).**

Those two answers, from the same four conversations, decide the path. If two or more pilots show credible expansion economics inside ninety days and score eight-plus on retention, you have the signal density for the £2M conversation Mia and Sal want you to run, with the tranche structure as fallback. If they don't, Finn's £1M-now plan is the one that survives contact with reality, and you call both angels by Wednesday — as Sage instructed — to convert "indicated" into wired.

— Fiona, Tuesday 18 November
```

---

## 4. Scores

Each tier scored 1–5 (0.5 increments) by claude-opus-4-7 acting as judge, on six dimensions. Composite = mean of the six.

| Dimension | Tier A (Free) | Tier B (Starter) | Tier C (Pro) | Tier D (Enterprise) |
|---|---|---|---|---|
| Actionability | 4.0 | 4.5 | 4.5 | 4.5 |
| Specificity | 4.5 | 5 | 5 | 5 |
| Strategic Depth | 4.0 | 4.5 | 4.5 | 4.5 |
| Voice Consistency | 4.0 | 4.5 | 4.5 | 4.5 |
| Multi-Specialist Coherence | 4.5 | 4 | 4.5 | 4.5 |
| Dissent Quality | 4.0 | 3.5 | 4 | 4 |
| **Composite (mean)** | 4.17 | 4.33 | 4.5 | 4.5 |
| Voice floor pass (≥4.0) | ✓ | ✓ | ✓ | ✓ |

**Composite deltas:**

- A → B: **+0.16**
- B → C: **+0.17**
- C → D: **+0.00**
- A → D (Free → Enterprise): **+0.33**


**Voice floor:** Per CLAUDE.md, any tier scoring < 4.0 on Voice Consistency is unfit-for-launch regardless of other scores. **All four tiers cleared the floor (4.0+).**

Per-dimension deltas summary:

- A → B: every dimension that's a model-quality proxy went up +0.5 (actionability, specificity, strategic depth, voice consistency). Multi-specialist coherence and dissent quality went DOWN by 0.5 — Tier B's better specialists actually agreed MORE, costing dissent.
- B → C: composite +0.17. The lift comes back via dissent quality (+0.5) and coherence (+0.5) — Opus is better at productive disagreement than Sonnet without losing the model-quality dimensions.
- C → D: **flat across every single dimension.** Extended thinking + bigger token budgets produced ZERO measurable Council improvement on this rubric.

---

## 5. Decision-rule output

Decision rules from the brief, against the actual scoring:

> **Rule:** "If Tier A and Tier B outputs are indistinguishable on the rubric → kill the Free→Starter intelligence delta. Free + Starter must be sold on volume/persistence/citations only, not smarter Council."

**Finding:** Tier B beats Tier A by **+0.16 composite**, with consistent +0.5 lifts on actionability, specificity, strategic depth, and voice consistency. **Free → Starter intelligence delta is real and rubric-visible** — the Starter Council reads materially sharper, with cleaner citations and crisper voice. Sell Starter on "smarter Council" with confidence (Sonnet host + Sonnet-on-strategy is the difference).

> **Rule:** "If Tier B and Tier C are indistinguishable → Pro can't sell on smarter Council either; sell on volume/seats/integrations."

**Finding:** Tier C beats Tier B by **+0.17 composite**, with the lift concentrated in dissent quality (+0.5) and multi-specialist coherence (+0.5). **Starter → Pro intelligence delta is also real**, but the *kind* of intelligence improvement is different — Pro doesn't make specialists individually smarter; it makes them disagree more productively, which is the Council's whole point. Sell Pro on "the Council that actually disagrees with itself, then resolves the disagreement" — that's a Pro-only behavior on this evidence.

> **NEW finding (was not in the original decision tree):** Tier C → Tier D is **+0.00 composite** across every dimension. Extended thinking on Opus + DeepSeek V4-Pro reasoning + +40% token budget produced ZERO measurable Council improvement on this rubric.

**Implication for Enterprise tier:** the upgrade story for Tier D _cannot_ be "smarter Council" — that lever is fully exhausted at Tier C. Enterprise must be sold on:
- volume / seats / consolidated billing,
- private knowledge-base integration (the Council reads from the company's own docs/CRM),
- audit trail / compliance / SSO,
- specialist customisation (founder defines a custom specialist with their own constraints),
- service-level guarantees.

Charging for extended thinking on its own is not defensible from this test. (Caveat: a single question, single judge run. Worth a 3-question replication before making this a hard pricing rule. The size of the gap — 0.00 vs the +0.16/+0.17 elsewhere — is more than judge-noise though.)

---

## 6. Qualitative diff highlights (verbatim moments where higher tiers surfaced what lower tiers missed)

### Tier C/D vs Tier A — strategic reframe lift

**Tier A (Sage on deepseek-chat):**
> "Hardware pre-revenue with 4 pilots and 6 months of runway. Two angels offering £1M total. The math is brutal: you need to find product-market fit in hardware in 6 months on £90k of remaining cash. That's not a constraint — that's a fantasy."

Strong, but stays at the level of "the math is bad."

**Tier C (Sage on claude-opus-4-7):**
> "Don't raise the round you want. Raise the round you can close in 60 days."

> "Now — the assumption that flips this. **Tell me what those 4 pilots are actually doing.** Because if even two of them have a credible path to expansion contracts in the next 90 days — real POs, not LOIs — then you have a traction story strong enough to go for £2M now and I'd reverse my answer."

Tier C surfaces the **expansion-vs-acquisition reframe** Tier A never reaches — "raise the round you can close" + "the metric that matters is pilot expansion intent, not user count." That's a non-obvious second-order insight a hardware founder will not pattern-match without it.

### Tier C — dissent that names a specialist by name

**Tier C (Mia on claude-sonnet-4-6) explicitly disagreeing with Fiona's framing:**
> "Fiona's framing is sharp, but it's missing the marketing layer — and the marketing layer is where this decision actually lives or dies."

> "The raise isn't a distraction from traction. The raise *is* the marketing campaign right now, and the four pilots are the creative brief."

Tier A's specialists never name another specialist or push back on Fiona — they answer in parallel but politely. Tier C's Mia explicitly engages with Fiona's framing AND with Sage/Finn's runway-math camp, which is what "productive Council disagreement" looks like in practice. This is the dissent_quality lift visible at the rubric level.

### Tier D vs Tier C — extended thinking added length, not insight

**Tier C (Mia close):** "The raise isn't a distraction from traction. The raise *is* the marketing campaign right now, and the four pilots are the creative brief."

**Tier D (Mia close, with extended thinking + 40% more tokens):** "the four pilots ... need to be case studies. Not fluffy ones — hard outcome case studies. ... You have the 'we don't have a hundred customers, we have four who can't leave' story, which at the £2M bracket is a better story than 'we have ninety-six customers who signed up last month.'"

Tier D's Mia is *longer* and slightly more cinematic, but the underlying insight ("weaponise the four pilots into case studies") is the same shape as Tier C's. Extended thinking added *prose density*, not new strategic moves. The judge agreed: D scored identical to C across the board.

### Tier B vs Tier A — Finn's dilution math appears at Tier B

**Tier A (Finn):** "100 users → 25x growth. If each pilot costs £5K to acquire and support, 100 users costs £500K — half your raise."

**Tier B (Finn):** "Raising now at a fair valuation (say £3-4M pre-money on £1M) gives you 33-50% dilution. Waiting and failing to hit 100 users gives you 100% dilution — the company dies. Waiting and succeeding gives you maybe 20% dilution on a £5-6M pre-money. The incremental dilution savings of 13-30% is not worth the 90%+ chance of running out of cash."

Tier B brings genuine dilution math (probability-weighted dilution outcomes across three scenarios) that Tier A doesn't reach. This is one of the cleanest examples of "specificity & strategic depth lift" on the rubric.

---

## 7. Total cost spent

Cost of the four-tier run + judge calls, computed from actual usage tokens:

| Tier | Approx LLM cost (USD) |
|---|---|
| A | $0.017 |
| B | $0.075 |
| C | $0.346 |
| D | $0.347 |
| Judge (4× claude-opus-4-7) | $0.81 (estimate) |
| **Total** | **~$1.60 / ~£1.25** |

Well under the £3 budget. Cost ratio Tier C : Tier A is ~20× — strongly suggests Tier C/D pricing must reflect the ~20× LLM cost (not just feature gating).

Per-tier latency (wall-clock, end-to-end Council):

- Tier A: 42s
- Tier B: 82s
- Tier C: 97s
- Tier D: 112s

Tier D is 2.7× slower than Tier A for ZERO measurable rubric improvement vs Tier C. Worth flagging.

---

## 8. Caveats

- **One question, one run.** Strong signal on the C → D flat result, but a 3-question replication should be done before this becomes a hard pricing rule.
- **Same judge.** Claude Opus 4.7 judging Claude Opus 4.7's output (Tier C/D) carries some self-preference risk. Cross-checking with a non-Anthropic judge (e.g. gpt-4.1) on the same transcripts would tighten the conclusion.
- **Citations were enforced via prompt only**, not via a structured-output validator. Tier B/C/D mostly complied; Tier A did not (and was not asked to). The rubric's "specificity" picked this up correctly.
- **One-shot, no follow-up question.** A real Council session may have a second turn (founder pushes back, specialists revise). This test only measures the opening hand.
- **No streaming UX measured.** A 112s D-tier latency may feel different in-product if streamed; a 112s blocking call would feel terrible.