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
(filled during testing)
