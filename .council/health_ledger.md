# Council Health Ledger — 2026-05-03

## CRITICAL: OpenRouter Credit Exhaustion

### Issue
- 4 of 6 council models returning HTTP 402 (insufficient credits) on OpenRouter
- GPT-5.4: 1,603 / 16,384 tokens remaining
- Gemini 3.1 Pro: 2,004 / 16,384 tokens remaining
- Kimi K2.6: 6,893 / 16,384 tokens remaining
- MiMo V2.5-Pro: 8,019 / 16,384 tokens remaining
- Only DeepSeek V4-Pro and Qwen 3 235B responding

### Impact
- All 5 ForgeOS projects stuck: 3 at `waiting_max` (HAPS, Desalination, Vertical Farm), 2 at `waiting_chase` (BESS, Hedgerow)
- All at `status=manual_review` (circuit breaker fired)
- HAPS had 10 scoring iterations, all flat 5/10 because judges returned 402
- Each 16K council call costs ~£0.01-0.10 per model; with 10 iterations × 6 models = significant spend

### Root Cause
- OpenRouter credits depleted from previous session's council usage
- User said "i have more credits" — needs to add credits at https://openrouter.ai/settings/credits
- No graceful degradation when credits exhausted — system keeps retrying

### Fix
1. User adds credits to OpenRouter account
2. Reset projects from manual_review back to idle
3. Re-run pipeline with fresh credits
4. Consider lower max_tokens for routine scoring (reduce from 16K to 4K for scoring tasks)

## BESS + Hedgerow: "Description required" Errors

### Issue
- All `vp-supply-chain` runs for BESS and Hedgerow failing with `"Description required (max 5000 characters)"`
- Both stuck at `waiting_chase` with `status=manual_review`
- This is likely the brief.decompose stage output being empty or too short for vp-supply-chain

### Status
- BLOCKED: Cannot investigate further until pipeline restarts (all projects in manual_review)

## Flat 5/10 Scoring Syndrome

### Issue
- HAPS had 10 scoring iterations, ALL scored exactly 5/10 on every dimension
- This suggests either:
  a) Fallback score applied when most judges fail with 402
  b) Judges are returning non-specific scores when they can't properly evaluate
  c) The decomposition output genuinely has issues (missing module descriptions, ground support equipment mixed in)

### DeepSeek V4-Pro Findings (actual issues found)
1. 'Hydrogen Fuel Supply Assembly' module has no description
2. 'Ground Station Satellite Terminal Assembly' is ground-based, not aircraft-integral
3. Missing subsystems: landing gear, thermal management, airframe segmentation
4. Left/Right Propulsion Assemblies lack independent interface definitions
5. Interface specs (mechanical, electrical, data, thermal) not consistently defined

## Session Notes
- Projects reached `waiting_max` from `waiting_chase` — the Chase prompt fix IS working
- But credit exhaustion prevents scoring from passing
- Need to monitor once credits are replenished
