# Red-Team Walk — Iteration 2 — Fixes Applied

Branch: `feat/forge-v2-cutover`
Date: 2026-04-25

## Fixes (commit hash → finding)

| # | Commit | Finding | Severity |
|---|--------|---------|----------|
| 8 | `36d97652` | `/agents/m/<thread_id>` (persistent meeting URL) crashed on every load with `typed.map is not a function`. `meeting_threads.citations` is jsonb but `createMeetingThread` was inserting the literal string `'[]'` instead of an empty JSON array; PostgREST returned a string at read time and `CitationsSidebar` tried to call `.map` on it. Fix: write side passes `[]` as an array literal; read side now `Array.isArray()`-defends against legacy bad rows. Existing prod rows with the string shape were repaired via a one-off `UPDATE ... SET citations = '[]'::jsonb`. | bug (P1 — page broken) |

## Surfaces re-walked in iteration 2 (no new bugs)

- `/today`, `/me`, `/plan`, `/money` — all clean post iter-1 fixes.
- `/investors` — type-breakdown chart legend now reads cleanly ("Government Grant" / "Venture Capital" / "Corporate Venture Capital" / "Private Equity"), no `GOVT_GRANT` / `CVC` / `VC` / `PE` slug leaks.
- `/agents` — heading is "Your Specialists" (was "AI Team"), no hydration warning on cold load.
- `/the-forge-v2/projects/<id>/suppliers` — page renders, no Build Error.
- `/the-forge-v2/projects/<id>/suppliers/shortlist` — clean empty state.
- `/the-forge-v2/projects/<id>/plan` — clean.
- `/finance`, `/learn`, `/my-profile`, `/marketplace-hub`, `/the-forge`, `/agents/artifacts`, `/welcome`, `/pricing`, `/admin/cost` — all clean.

## Council brainstorm flow walked end to end

1. Click "Join Huddle" on Product Ideation card → Council picker opens with Quick / Full / Deep / Strategy tiers.
2. Pick Quick Council → 5 specialists pre-selected (Sage, Mia, Fang, Priya, Cal, Fiona — actually 6 surfaced in one run, 5 in another, normal Council variance).
3. Type a topic, "Start Meeting" → first specialist starts streaming.
4. Sage's response renders Voice Sandwich opener (`**Quick take —**`) as proper bold strong tag in expanded view.
5. Collapsed-row preview now reads "Quick take — We are letting..." without literal asterisks (was the iter-1 markdown leak fix).
6. "Let Them Discuss" → Mia speaks Round 2.
7. "Wrap Up" → Meeting Outputs dialog with processing animation, then "Build this in The Forge" + "See which investors would back this" handoff buttons.
8. `/agents/m/<thread_id>` (persistent URL) now renders the topic, "Branch from here" + "Run a follow-up" CTAs, and the citations sidebar empty-state message.
9. "Branch from here" fires and creates a new thread (toast "Branch created").

## Open findings — needs design (carried forward from iter 1)

- Specialist title acronyms (CTO / VP Engineering / VP Manufacturing / VP Supply Chain / HR) — specialist personality config off-limits per protocol.
- Three Supabase RPCs with empty `search_path` and unqualified table refs — needs Tristan's call.
- Cookie banner overlays bottom of viewport.
- Vaul Drawer hydration warnings (third-party).
- "AI Tasks" still used as the in-product budget-meter label.
- Forge Ambassador surface invisible until 10 referrals (per audit Tier 5 work).
- Sidebar "Outputs" vs page heading "Deliverables" wording inconsistency.
- Specialists referencing each other by name when they aren't in the meeting (LLM hallucination — friction).
- Post-signup default landing is `/welcome` not `/investors` (per audit Tier 2 step 17).

## Persona verdicts after iteration 2

| Persona | Verdict |
|---------|---------|
| Ready Buyer | On the fence → Buy (Council brainstorm runs end to end and produces real specialist replies; persistent meeting URL works; handoffs render at the end of a session) |
| Skeptic | On the fence (acronyms cleaned up, signup actually works, hydration warnings gone — but the seed data on the anonymous /agents teaser is still hand-crafted so the trust gap survives) |
| Confused Visitor | On the fence → Buy (heading is coherent, anonymous signup wall is clear, post-signup lands at /welcome with named "doors" Tristan-voiced) |
