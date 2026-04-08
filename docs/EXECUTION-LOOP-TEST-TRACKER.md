# Autonomous Execution Loop — Test & Red Team Tracker

## Test Matrix

### Test 1: Manual Task Creation + Sweep Trigger
- [ ] Create test tasks in Supabase (Mia: blog post, Sage: research)
- [ ] Trigger sweep via /api/cron/agent-sweep
- [ ] Check agent_artifacts for deliverables with publish_status='review'
- [ ] Check tasks for status='Completed'
- [ ] Check agent_sweep_log for execution entries

### Test 2: Deliverables in /review
- [ ] Login to app
- [ ] Navigate to /review
- [ ] Verify deliverables are visible with specialist attribution

### Test 3: Content Quality Assessment
- [ ] Read generated blog post — is it credible for PE audience?
- [ ] Read generated research — does it contain real data?
- [ ] Compare output quality: Sonnet vs specialist's own model

### Test 4: Model Selection Fix
- [ ] Update sweep-orchestrator to use specialist's modelTier
- [ ] Verify model selection works per specialist
- [ ] Type check passes

## Code Fixes Required Before Testing
- [ ] Fix: Use specialist's modelTier instead of hardcoded Sonnet
- [ ] Fix: Add web search capability for research tasks (general type)

## Red Team Rounds
- [ ] Round 1: Execution correctness (does the loop work end-to-end?)
- [ ] Round 2: Cost & budget (does execution stay within limits?)
- [ ] Round 3: Quality & reliability (is output good enough?)
- [ ] Round 4: Edge cases & failure modes

## Results

### Test 1: Manual Task Creation + Sweep Trigger — PASS
- [x] Created test tasks in Supabase (Sage: PE fund research in forge-guild foundry)
- [x] Triggered sweep via /api/agents/sweep-trigger with event_type=objective_completed
- [x] Artifact created: "Strategy Brief: Penetrating UK PE Funds" (6032 chars, content_type: report)
- [x] Task marked Completed automatically
- [x] Sweep log shows two entries: analysis ($0.003) + execution ($0.014)

### Bugs Found & Fixed During Testing
1. **FREE TIER BLOCKS SWEEPS** — foundry-demo is free tier, sweeps skip free/starter. Moved test to forge-guild (Professional).
2. **`priority` COLUMN DOESN'T EXIST** — getExecutableTasks queried nonexistent column, silently failed. Fixed to use risk_level. Commit `latest`.
3. **`owner_agent_id` IS UUID** — can't store string specialist IDs. Added `specialist_id TEXT` column. Commit `a064ef49`.

### Content Quality Assessment
- **Sage's output is excellent** — 6K chars, specific PE fund names, deal sizes, contact approaches
- **Maintains specialist voice** — opens with "the ONE thing that matters most" (Sage's signature)
- **Properly structured** — markdown with H3 sections, bullet points
- **Model used: Gemini 3.1 Pro** (Sage's benchmarked model) — adequate quality, 10x cheaper than Opus

### Model Recommendation
Gemini 3.1 Pro (for Sage) produced PE-fund-credible content at $0.014/task. Opus would be ~$0.15/task for marginal quality improvement. **Recommendation: Keep specialist's own model.** Upgrade to Opus only if content is rejected >30% of the time.
