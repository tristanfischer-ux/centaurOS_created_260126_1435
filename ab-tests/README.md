# Gemini 3.5 Flash plumbing A/B tests — 2026-05-19

## Conclusion

**Gemini 3.5 Flash is a reasoning-first model**, despite the "Flash" branding.
- 79-96% of completion tokens are reasoning_tokens (depending on prompt size + max_tokens).
- For prompts under ~5K context with structured-judgment output, it's a sweet spot.
- For prompt sizes above that, the reasoning-token tax kills the cost-benefit.

## Test results

### Test 1 — Probe (physics critic, ~150-token prompt, max_tokens=2000)
- Result: PASSED. Caught a planted physics error (COP claimed 3.5, actual 3.08 from 8kW/2.6kW).
- 1281 of 1465 completion tokens = 87% reasoning.
- $0.013/call. 6.5s latency.
- See: `probe-3.5-flash-physics-critic.json`.

### Test 2 — Investor whyFit A/B (~12K prompt, max_tokens=3000)
- DeepSeek V4-Flash (production): clean JSON, specific portfolio references (HydroNTech, Sinclair Dunlop, Boiler Upgrade Scheme), patent-gap risk callout. $0.0007/insight.
- Gemini 3.5 Flash @ 3K max_tokens: **FAILED**. 2879/2996 completion tokens = 96% reasoning. No JSON, just internal thinking fragments. $0.029 wasted.
- See: `investor-whyfit-A-deepseek.json`, `investor-whyfit-B-gemini35flash-3k.json`.

### Test 3 — Same as Test 2 but max_tokens=6000
- Gemini 3.5 Flash: succeeded. 3146/3963 = 79% reasoning. Clean JSON. Quality comparable to DeepSeek but no nuanced patent-gap callout. $0.038/insight.
- See: `investor-whyfit-B-gemini35flash-6k.json`.

## Cost comparison

| Use case | DeepSeek V4-Flash | Gemini 3.5 Flash @ 6K | Multiplier |
|---|---|---|---|
| Per investor whyFit | $0.0007 | $0.038 | 53× more expensive |
| Per 1000 insights / foundry / month | $0.70 | $38 | — |

## Where Gemini 3.5 Flash IS the right tool

- Chain physics critic (~3K prompt, judgment + structured JSON output) — sweet spot
- Chain plausibility critic (~2K prompt, physics-floor judgment) — sweet spot
- Possibly: chain brief rewriter, chain R4 reviewer (TBD — need realistic-prompt A/B)
- Possibly: Strategic Planner (replacement for GPT-5.4 — cost saving)

## Where Gemini 3.5 Flash is NOT the right tool

- Investor whyFit (KEEP DeepSeek-V4-Flash — 53× cheaper, comparable quality)
- Brainstorming Council seats (preserves lineage diversity)
- Morning digest (already cheap with GPT-4.1-mini)
- Money thesis extraction (explicitly chosen GPT-4.1-mini for low hallucination)
- Any bulk per-row call (Engine B classifier, Engine D scorer, part-verify judge)
