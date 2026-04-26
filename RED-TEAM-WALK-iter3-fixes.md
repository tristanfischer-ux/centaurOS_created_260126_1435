# Red-Team Walk — Iteration 3 — Fixes Applied

Branch: `feat/forge-v2-cutover`
Date: 2026-04-25

## Fixes (commit hash → finding)

| # | Commit | Finding | Severity |
|---|--------|---------|----------|
| 9 | `4bb60db1` | The Planet A teaser card and the four blurred locked-match tiles on the anonymous `/investors` page rendered the raw firm_type slug ("VC", "PE", "CVC") in the badge. Same bug class as the iter-1 logged-in match list fix, just on a different code path. Now uses the same `normaliseFirmTypeLabel` helper so anonymous visitors see "Venture Capital", "Private Equity", "Corporate Venture Capital". | bug (voice) |

## Iteration 3 — what was re-walked

The whole loop ran again with explicit cache-bust query strings on every navigate:

- 14 logged-in routes — all returned 0 issue badges.
- 7 anonymous routes — all returned 200.
- New Council brainstorm started from scratch — Quick tier, Sage + Mia, ran through Round 2.
- Sage's "**Quick take —**" markdown rendered as `<strong>` in the expanded entry, plain text in the collapsed-row preview (verified the iter-1 markdown stripping in `getPreview` is working in the actual user flow).
- Persistent meeting URL `/agents/m/<id>` re-loaded — clean, no `typed.map` crash.
- Anonymous → /investors → search → wall → walked again — clean.

## Iteration 3 — only one fresh bug surfaced

It was a missed code path from the iter-1 firm-type-label sweep — the anonymous teaser uses `AnonymousInvestorsClient.tsx`, not the logged-in `InvestorMatchView.tsx`. Fixed in `4bb60db1`. After this fix the loop is converging.

## Persona verdicts after iteration 3

| Persona | Verdict |
|---------|---------|
| Ready Buyer | Buy — Council brainstorm runs, suppliers page no longer crashes, signup works, handoffs land. |
| Skeptic | Buy — every acronym leak fixed across surfaces; copy is consistent; brainstorm output is the killer feature; persistent URL gives them a thread to come back to. |
| Confused Visitor | Buy — anonymous routes render the right thing in the right order, signup-wall on search is clearly worded, post-signup foundry name auto-derives from the email local-part so the user is never asked to repeat themselves. |
