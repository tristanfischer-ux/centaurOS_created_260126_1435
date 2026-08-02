# Side-channel discipline audit — recommendation, 2026-08-02

## Gap 1 — run the start/finish PAIR on every work package
Of 16 commits since 23:00 yesterday, only 5 cite discipline. The offenders the
hook now prevents (path-current fix 11928d56c, the baseline measurement, the
magnet-respec reversal) ran before the gate existed and have no finish council.
The hook only checks that a FINISH council exists — it does not run the START
half, which is the "look before you leap" half that would have blocked the
hand-derives. Also: put `--plan-ref` under open plan items so the plan-fit
REFUSAL path has teeth on-stage, not only in selftest.

## Gap 2 — make the diff-review council a hard gate, not a manual step
`.husky/pre-commit` says verbatim: "Not run here (costs money and minutes) — run
it yourself before landing anything with a load-bearing claim." So
`council_precommit_review.py --staged` is advisory. Either wire it into the
hook, or gate `finish` on a review artefact for that diff.

## Hygiene, verified
1. Keep the capability dossier "scoped to active twins only" — a hook blocking
   on all 1,594 out/ dirs would be disabled within a day. Do not widen it.
2. `core.hooksPath` is now correctly this repo's `.husky/_` after the
   sibling-checkout bug. Re-check after any clone.

## On the torque outcome — do not re-litigate
81.56 N·m = 0.652× on the fully fixed deck is the right, honest number. The
architecture gap in §5.3 stands and is the only decision that now matters. Do
not spend a council round re-opening the magnet rebalance: it is worth 3.07×,
demag-safe at ×3.25 / 160 °C, and judged correctly.

---

## TERMINAL'S READING, before the work (verified against code, not claims)

Gap 2 as stated is ALREADY CLOSED, and the real gap is adjacent and sharper.
`p_stage_discipline.cmd_finish` runs `git diff --cached` and passes it to
`council_precommit_review.review()` — the SAME function, seats and role prompts
that `council_precommit_review.py --staged` uses. So the finish council IS the
diff-review council, and it is blocking.

What is genuinely missing is the BINDING between a panel and the diff it saw.
Today `verify-panel` checks the panel is a real, fully answered council and the
hook checks its mtime — so a panel can legitimately have reviewed an EARLIER
version of the staged code. This bit during this very session: answering a
council required code edits, which left the panel describing a diff that no
longer existed, and only mtime ordering caught it.

FIX: record `reviewed_diff_sha256` in the panel at review time, and have
`verify-panel --against-staged` recompute the staged diff hash and refuse on a
mismatch. That closes three things at once — Sol's "satisfiable by an unrelated
twin" (an unrelated panel cannot carry this diff's hash), the stale-panel hole,
and the first half of Sol's twice-raised content-hash request.
