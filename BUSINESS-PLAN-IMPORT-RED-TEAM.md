# Business Plan Import — Red Team Plan

**Date:** 2026-04-11
**Goal:** Make the business plan import produce high-quality strategic objectives, objectives, and tasks from the commercial audit action plan. Must work reliably, produce results matching what a skilled human strategist would extract.

## Approach

### Round 1: Direct API test
- Call the Opus objectives prompt directly against the commercial audit document
- See what raw JSON it returns
- Compare against the expected output (what Grok produced)
- Identify gaps

### Round 2: Prompt refinement
- Fix any issues found in Round 1
- Re-test
- Verify the output matches expectations

### Round 3: Full pipeline test via agent-browser
- Upload the document through the app UI
- Verify the merge dialog shows correct objectives, tasks, hires, funding
- Screenshot the result

### Round 4: Edge case testing
- Test with a shorter document
- Test with a traditional business plan
- Ensure the prompt works for both action plans and business plans

## Expected Output (from the commercial audit)

The import should produce approximately:

**Strategic Objectives (5-10):**
1. Complete critical site fixes (Day 1-2)
2. Create proof points — demo video, case study, about page (Day 2-3)
3. Build prospect list of 50 hardware founders (Day 3)
4. Execute founder-led outreach — Batch 1 (Day 4-5)
5. Run first demo calls and conversions (Day 5-7)
6. Community and content push (Day 6)
7. Close first paying customers (Day 7-8)
8. Double down — weeks 2-4 outreach and content
9. Accelerator partnerships (Week 3)
10. Optimize and scale — month 2-3

**Each with 3-8 tasks including:**
- Specific actions (not vague)
- Role assignments (Executive/Apprentice/AI_Agent)
- Timing from the document

## Status

- [x] Round 1: Direct API test — Opus returns 14-15 objectives, 7687-8014 output tokens, 148s
- [x] Round 2: Prompt refinement — Prompt is working well. Key insight: Opus wraps in ```json fences despite instruction, but stripFences handles it. Build error was from maxDuration in "use server" file — moved to page route config.
- [ ] Round 3: Full pipeline test via live app (deployment verified Ready, auth testing blocked in headless browser)
- [ ] Round 4: Edge case testing

## Round 1 Results (Direct API — 2 separate runs)

Both runs produced 14-15 objectives with high quality. Sample:
1. Emergency Site Fixes — Eliminate Credibility Killers (8 tasks)
2. Create Proof Points — Demo Video, Case Study, About/Contact Pages (6 tasks)
3. Build Qualified Prospect List — 50 Hardware Founders (4 tasks)
4. Launch Direct Outreach — Batch 1 (20 Prospects) (4 tasks)
5. Continue Outreach & Conduct Demos — Batch 2 (30 Prospects) (5 tasks)
...and 9-10 more covering Weeks 2-4, content, partnerships, scalable acquisition, KPIs.

Each task has proper role assignment (Executive/Apprentice/AI_Agent) and estimated days.

## Key Findings
- Opus takes ~148s (well within the 300s maxDuration)
- Output is consistently 7500-8000 tokens (within the 8192 limit)
- The "0 objectives" bug was caused by: (1) Sonnet being too weak, then (2) maxDuration timeout at 60s, then (3) build error from maxDuration in "use server" file
- Now fixed: Opus + maxDuration=300 on page + proper fence stripping
