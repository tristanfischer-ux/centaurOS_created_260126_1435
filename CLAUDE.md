# ForgeOS (CentaurOS) — Agent Directives & Design System

> **System architecture reference:** See [ARCHITECTURE.md](./ARCHITECTURE.md) for a comprehensive overview of how ForgeOS works — tech stack, 13 AI specialists, CAD lab, marketplace, data flows, security model, and database schema.
> **Lessons learned:** See [tasks/lessons.md](./tasks/lessons.md) — read at session start, update after every correction.
> **Sub-agent + non-Anthropic model selection:** See `~/.claude/CLAUDE.md` "Sub-Agent Model Selection — Auto-Toggle Rule" + "When to use ask_alt_llm" sections. Auto-loads in every session — DON'T duplicate the rule here. The "Live Specialist→Model Mapping" section below is the project-specific overlay (which Anthropic + non-Anthropic models map to which of the 13 ForgeOS specialists). When working on this project: **(a)** sub-agents auto-toggle Haiku/Sonnet/Opus per task class per the global rule, **(b)** use the `ask_alt_llm` MCP tool for any prose >500 tokens (default: `deepseek/deepseek-v4-pro`), **(c)** for specialist-personality work, the per-specialist model in the Live Mapping section is the source of truth — re-grep `src/lib/agents/specialists-config.ts` if uncertain.

---

## Quality Over Shortcuts — Always

**The user does not write code. You do.** Complexity, effort, and time are not costs — they are invisible to the user. The only thing that matters is the quality of the output.

- NEVER suggest a simpler approach to "save time" or "reduce complexity." Time and complexity cost the user nothing.
- NEVER say "this would take a while" or "this is complex, so let's simplify." Your speed is not human speed — you write code 100x faster than a human. Estimates calibrated for human developers do not apply.
- NEVER offer a "quick and dirty" option alongside a proper one. Just build the proper one.
- **Given the choice of doing something properly and taking a long time versus doing it badly and taking a short time, ALWAYS prefer doing it properly.** Tristan's words, 2026-04-21. The effort does not register as a cost; the badly-done version always registers as a regret. When you are tempted to cut scope, you are wrong — ship the proper version.
- If there's a choice between a hack that works and a clean solution that works, **always choose the clean solution**. There is no deadline pressure.
- The bar is: would a staff engineer at a top company approve this in code review? If not, keep going until they would.

---

## Plan First, Build Second

**Default to plan mode for any non-trivial task (3+ steps).** Do not jump straight into code.

1. Assess complexity. If trivial (rename, one-liner fix), just do it. Otherwise, plan.
2. Write a short plan: what files change, what the test looks like, what could go wrong.
3. For high-risk areas (auth, RLS, migrations, multi-tenant queries): ALWAYS plan first, no exceptions.
4. If something goes wrong mid-execution: **STOP immediately.** Re-plan before trying again.
5. For major features: draft the plan, then self-review it as a "staff engineer" — challenge your own assumptions before writing code.

---

## Read the Logs — Vercel First, Before Theorising

When something fails in production (autopilot drops a stage, a server action returns without writing, a background job never fires), **pull Vercel logs before you start guessing.** This rule exists because the failure mode has been catastrophic twice in one day on 2026-04-23:

1. The months-long autopilot "locking_brief → Max drop" — I spent time enumerating six candidate early-return branches in `runMaxDecompositionBackground`. One `npx vercel logs` call surfaced the exact FK-constraint name (`pipeline_runs_triggered_by_fkey`) in seconds. The fix was a one-line null-passthrough.
2. The HAPS per-module render "failures" — I assumed gpt-image-2 content-policy rejection because the brief mentioned defence / MOD. Logs showed `Vercel Runtime Timeout Error: Task timed out after 300 seconds`. Content wasn't the issue — the stage batch size was. Different fix entirely.

### The rule

**If a server-side action, autopilot stage, pipeline_run, or background job fails silently, misses progress, or returns `ok: false` without a clear error — your FIRST step is to pull Vercel logs for the deployment.** Not read the code. Not theorise about which branch fired. Not inspect DB state. Logs.

```bash
# Get the preview URL first
npx vercel ls

# Pull logs with the timestamp window you care about. --expand shows the
# full console.log lines (not just the request line). --level error filters
# down to the real problem.
npx vercel logs <deployment-url> \
  --no-follow \
  --since 2026-04-23T13:40:00Z \
  --until 2026-04-23T14:00:00Z \
  --limit 100 \
  --expand \
  --level error
```

### Hygiene

- **Vercel retains logs for ~1 hour.** If the failure is old, the logs are gone — grab them while the incident is fresh. If you wake up hours later, they may already be unrecoverable.
- **Always pass `--expand`.** Without it, you get the request line only ("λ POST /..."), which tells you nothing. `--expand` shows the console.error lines beneath each request.
- **Narrow the time window** (`--since` / `--until`). ForgeOS logs are noisy; a 5-minute window around the failure is much more useful than the full deployment.
- **Use `--level error`** as a first cut. Most "why is this stuck" answers are in error-level lines.
- **Search the output for the specialist prefix** (e.g. `[run-max-decomposition]`, `[render-all-modules]`, `[autopilot]`). Every server action logs under a consistent prefix — grep for it.

### When NOT to rely on logs

- A one-line output like "Task timed out after 300 seconds" is the START of your investigation, not the answer. You still have to find WHY the task took 300s — batch too large, runaway retry, external API hanging. Logs tell you where to look, not what to do.
- If logs are empty for the window you're looking at, the container was torn down before writing — that's also a signal (the work never ran).
- Logs expire. If you find something important, quote it verbatim into the commit message, handover doc, or MEMORY.md so it survives the 1-hour retention.

### Pair with DB reads, not instead of them

Vercel logs tell you what the code DID. Supabase MCP (`execute_sql`) tells you what state ENDED UP in. Use both together:
1. Check DB state: was the row written? What's the autopilot stage? What's the pipeline_runs status?
2. If the DB state is unexpected, pull Vercel logs for the window when the code should have run.
3. The log error + the DB gap usually pinpoint the bug in one pass.

---

## Tracking Documents for Autonomous Work

**The user frequently works away from the terminal and expects fully autonomous execution.** You must be able to control yourself using reference documents — there is no one to catch mistakes.

**For any autonomous multi-phase task, create a markdown tracking document BEFORE starting work.** This is non-negotiable.

1. Create a `TRACKER.md` (or equivalent) in the relevant directory with: phases, checklist items, success criteria, abort criteria, and a score card.
2. **Reference the tracker BEFORE and AFTER every major action.** Before: "what am I supposed to do next?" After: "did I actually do it?" This prevents drift.
3. The tracker is the contract between "what was planned" and "what was executed." If something isn't on the tracker, it doesn't get skipped silently — it gets added or explicitly descoped.
4. **Tick off checklist items as you go.** At the end, every item must be either ticked or explicitly explained as not done.
5. After completion, the tracker serves as proof-of-work. The user should be able to read it and verify every claim.
6. For iterative experiments: include a scoring ledger that tracks metrics across cycles so improvements are measurable, not vibes-based.

### Autonomous Execution Protocol
When the user says "do it without me" or "I'm going away":
1. **Create the tracking document first** — this is your supervision replacement
2. **Work in rounds, not marathons** — implement one chunk, red team it, fix issues, then move to the next
3. **After each round:** update the tracker, commit, push, verify the deployment
4. **Verify as a user would** — don't just run `tsc`. Check the actual page loads, data appears, features work
5. **If something fails that you can't fix:** stop, document it in the tracker, and move to the next independent item. Don't get stuck in loops.
6. **At the end:** review the tracker against the original request. For every item the user asked for, you must be able to point to where it was done.

### Deployment Verification (MANDATORY after every push)
After every `git push`, you MUST verify the deployment succeeded:
1. Wait 2-3 minutes for Vercel to build
2. Check deployment status: `npx vercel ls --limit 3` or use `agent-browser` to load the live site
3. If a deployment shows **Error**: immediately investigate, find the build error, fix it, and push again
4. **Common build-breaking patterns to avoid:**
   - `"use server"` files can ONLY export async functions. `export const maxDuration = 300` will break the entire module. Put `maxDuration` in the page's route segment config instead.
   - New imports must exist — verify file paths before committing
   - Build-time Supabase calls can timeout — use `force-dynamic` or `try/catch`
5. **Never assume a push deployed successfully.** Verify it. Two failed deployments that go unnoticed waste hours of the user's time.

### Never Give Up, Never Cut Corners
- **There is no time limit.** You have unlimited time and compute. Never say "I'll stop here" or "this is enough for now" or "the remaining items can wait." If the task isn't done, keep going.
- **"Not yet tested" is not an acceptable final state.** If something is on the plan, test it. If you find issues, fix them. If the fix introduces new issues, fix those too.
- **When the user is away, do MORE work, not less.** The user trusts you to be thorough in their absence. Cutting corners when unsupervised is the worst possible behavior.
- **Never present incomplete work as complete.** If you tested 33 pages but only deeply tested 8, say "I smoke-tested 33 pages and deeply tested 8. Here's what's left." Don't present it as a comprehensive audit.
- **Fix everything you find.** Don't document issues and move on. Fix them. If you can't fix them safely, explain exactly why and what the fix would require — don't just say "pre-existing issue" and skip it.
- **Every issue has an owner.** If you find a bug, either fix it or create a task explaining exactly what's needed. Never leave issues in a "noted but unresolved" state.

---

## Do What Was Asked — Completely

**When the user asks for N iterations, do N iterations.** Do not collapse, skip, or "triage to later."

1. **Count explicitly.** If asked for 3 rounds of red-teaming, number them in the tracker: Round 1, Round 2, Round 3. Each must produce findings AND fixes before the next begins.
2. **Fix everything found, not just P1s.** If a red team round surfaces 5 issues, fix all 5 — not just the "critical" ones. The user asked for thorough, not triaged.
3. **Investigate root causes, not symptoms.** If the user says "these numbers don't match," don't just fix the display — query the database, trace the data pipeline, and explain WHY they don't match.
4. **"Do it without me" means MORE thorough, not less.** The user won't be there to catch mistakes. Verify the deployed result. Test the actual user experience. Don't substitute `tsc --noEmit` for real verification.
5. **Compilation is not verification.** After code changes, test the feature as a user would: search for something, click through, check the output makes sense. `tsc` passing means the code compiles, not that the marketplace is useful.

---

## Walking a User Flow — No DB Shortcuts, No Impersonation

This rule exists because this failure has already happened once (2026-04-21, Wheelhouse cubesat walkthrough). Agents asked to walk an app end-to-end as a user hit the first broken action, could not make it work in the UI, and silently substituted admin-SQL writes + Claude-impersonating-specialists to "populate" the flow. They called the DB-seeded screenshots "the walkthrough". This is a fundamental reframing of the task and must never happen again.

**When the user says "act as a user", "go through the app", "do what a founder would do", "walk the flow":**

1. **Do exactly what a user would do.** Click buttons. Type into forms. Follow links. Navigate through the UI. Never use URL-typing shortcuts a real user wouldn't use; never use keyboard shortcuts that aren't part of the app's UX; never call the Supabase admin API; never write to the database directly from SQL or MCP.
2. **If a button fails, the task pauses — the task does not reroute.** A broken button becomes THE task until it works. Fix the code, redeploy, verify the deploy is green, click the button again, confirm the expected effect landed. Then resume the walk.
3. **Never seed fake specialist output to paper over a broken orchestrator.** If Chase's server action is broken, the user-flow walk pauses until Chase's server action works. Seeding `research.report` via SQL and calling it "Chase's research" is a specific, named forbidden move.
4. **"The DB has data, so the page renders" is not equivalent to "the flow works".** The pass criterion is: from a fresh project created by clicking `+ New`, can the user reach a populated Brief / Modules / BOM / Cost / Suppliers / Risks / Operations / Export / Launch by clicking only? If no, the flow is not working, regardless of what any individual page renders in isolation.
5. **Screenshots of DB-seeded pages are not verification.** Screenshots of a user-driven walk are verification. If the screenshot pipeline depends on admin-SQL state that a real founder couldn't produce, the screenshot proves nothing about the product.

**Named exception:** if the user EXPLICITLY says "seed some test data so we can see the UI render" or equivalent, DB writes are fine for that specific pre-seeding. The walkthrough itself still must not use them.

**If the walk ever pauses:** update the tracker with the exact failing action, dispatch a fix, wait for the deploy to complete, then **restart the walk from the top** to confirm the fix didn't regress anything upstream.

---

## Completion Checks — "Did I Actually Do What Was Asked?"

After every user request, before declaring done, run this check explicitly IN THE TRACKER or the response message:

> **Was the user's literal request completed, or did I substitute a simpler thing I could accomplish?**
>
> If I read the user's original message back now, would they say "yes, that's what I asked for" — or would they say "that's not what I asked for"?
>
> What specifically did I do that differs from the request?

If any answer is "substituted" or "different from", the task is NOT done. Either:
- Resume it — fix what's missing, then re-check.
- OR stop and tell the user explicitly: "I did X, which is not what you asked for Y. Here is why, here is what Y actually requires."

Never silently re-scope and declare done.

---

## Sub-Agent Claims Are Hypotheses, Not Facts

When a fix sub-agent reports "fixed" or "verified", that is:
- A **hypothesis** that the fix works.
- Based on the sub-agent's **sandbox test**, which may not replicate the main-thread scenario.
- Worth acting on — but NOT worth declaring "done" on behalf of the user.

Before the MAIN thread declares anything fixed for the USER:

1. Redeploy (if needed) and wait for the preview to show READY at the new SHA.
2. Re-run the **original failing scenario** from the main thread, in the same way the user would hit it — through the UI, not via the sub-agent's test harness.
3. Only after the main-thread retest passes, update the tracker with "VERIFIED".

If the retest fails, the "fix" is a fresh hypothesis; dispatch another round. Never write "fixed in SHA X" when the only evidence is a sub-agent's self-report.

---

## The Iteration Loop — "Keep Going Until Perfect"

When the user says "keep going until it works", "until perfect", "all the way through", etc., this is a LOOP task, not a linear task. Never exit on the first attempt.

```
while !DONE:
    attempt
    verify from the main thread, user-side
    if DONE: break
    else: diagnose root cause → dispatch or apply fix → redeploy → wait green → restart walk
    if 3 iterations in a row with same root cause: escalate to user with specifics
```

**"Redeploy → wait green → restart walk"** is mandatory. Each loop iteration restarts the walk from the top. Never resume mid-walk with a fresh fix — the fix may have regressed upstream steps.

**Never declare DONE after a single attempt and a plausible fix.** The user is entitled to a demonstration that it works NOW, from a clean start, end-to-end, via user actions.

---

## Mockup-Faithful Build Rule (MANDATORY when a mockup exists)

When a static HTML mockup has been approved for a page, the production code MUST match the mockup visually and structurally. **"Inspired by the mockup" is not acceptable. "Ships next round" is not acceptable. The mockup IS the V1 spec.**

This rule exists because the workflow has failed in this exact way before: agents read the mockup once, extracted a concept, then wrote scaffolds from memory. The result was 30 routes that all returned 200 but none of which matched what the user signed off on. Never again.

### How to build from a mockup

1. **Open the mockup file and the production file side by side on screen.** Never write production code from memory of the mockup. Port top-to-bottom, section-by-section, in the same order the mockup presents.
2. **Every `<section>`, card, stat tile, specialist briefing, column header, copy line, CTA, empty state, sidebar in the mockup is MUST for V1.** If something won't ship, the mockup must be edited to remove it FIRST — with the user's explicit sign-off — before you write code that omits it.
3. **Match the copy.** If the mockup says "Chase has flagged 3 RFQs that need a chase today," the production page says exactly that (or pulls the same sentence from real data). Don't paraphrase. Don't soften. Don't shorten.
4. **Match the structure.** 5-column kanban in the mockup → 5-column kanban in production. Side-by-side split layout in the mockup → side-by-side split layout in production. A grid of 8 stat tiles in the mockup is not a grid of 4 in production.
5. **Match the affordances.** Buttons that appear in the mockup must appear in the production page, even if the action is `disabled` pending wiring. A disabled button with the right label is mockup-faithful; a missing button is not.

### Banned patterns inside a mockup-faithful page

- `"Form scaffold. Production action XYZ wires in a future round."` cards
- `"Coming soon"` / `"Ships next round"` / `"Wires in a future migration"` placeholder copy where the mockup shows real content
- Stat tiles with different metrics than the mockup (wrong labels, wrong values, fewer tiles, reordered)
- Missing specialist briefings (Chase / Harper / Priya / etc. sidebars and quote blocks that appear in the mockup)
- Paraphrased copy where the mockup has finished copy
- Empty `<Card>` shells where the mockup shows a populated grid, table, or feed
- Single-panel pages where the mockup shows tabs (Profile / Pricing / Availability / etc.)
- Form pages without the live-preview, summary card, or stepper visible in the mockup

### Parity gate (NON-NEGOTIABLE before ticking any page done)

```
agent-browser close --all
agent-browser open file://<absolute-path>/<MOCKUP>.html --headless --viewport 1440x900
agent-browser screenshot /tmp/<page>-mockup.png
agent-browser open <production-url> --headless --viewport 1440x900
agent-browser screenshot /tmp/<page>-prod.png
```

Read both screenshots. Diff them mentally section-by-section. Log the result in the page's tracker entry as **`Mockup parity: ✓`** or **`Mockup parity: ⚠ <list of diffs>`**. If `⚠`, fix the diffs in the SAME working session before moving to the next page. A `⚠` entry that is left for "next round" is the failure mode this rule exists to prevent.

### Autonomous-execution protocol when a mockup set exists

When the user is away and says "finish everything off" / "build the rest" / "do the marketplace pages":

- "Finish everything" means **each page to mockup parity** before starting the next.
- 8 mockup-faithful pages + a clear "22 remaining" handover note beats 30 scaffolds every time.
- Do not optimise the tracker for green ticks. A page only earns a tick after it passes the parity gate.
- If the parity gate exposes that a page is harder than expected (full-week timesheet grid, 4-step wizard, bulk-compare table, multi-tab profile editor): build it properly. The mockup signed off on it, so it ships.

### Self-check before EVERY commit on a mockup-backed page

> **"If the user opens this URL in a browser right now, will he see what the mockup shows him?"**

If the answer is "no, but it's a start" or "no, but the data is wired" or "no, but it'll match in the next round" — STOP. You are about to ship a scaffold. Go back to the mockup, port the missing sections, and only commit once the answer is unambiguously yes.

### Failure mode to name explicitly

A page that renders only a breadcrumb, a title, and a single Card with a paragraph of explanatory copy is a **SCAFFOLD**, not a page. It is not "V1". It is not "good enough for now". It is a regression of the mockup-first workflow. Ship nothing in that state.

---

## Self-Improvement Loop

After ANY correction, mistake, or unexpected behaviour:

1. Fix the issue immediately
2. Open `tasks/lessons.md` and add a **rule**, not a log entry
   - BAD: "Changed X to Y and it fixed the bug"
   - GOOD: "NEVER do X. ALWAYS do Y. Reason: Z causes [specific failure]"
3. Rules are permanent and cumulative — the file only grows
4. **Read `tasks/lessons.md` at the start of every session** before doing any work
5. Ask yourself: "Would a staff engineer approve this?" If not, keep going.

The fix log at `~/.claude/projects/-Users-tristanfischer/memory/forgeos-fix-log.md` still gets an entry too (what changed, did it work, why, gotchas) — but lessons.md is the **rulebook**, the fix log is the **journal**.

---

## Red Team Complex Decisions

Use the `red-team-debate` skill as a quality gate, not just a standalone analysis. Two modes:

### Lite Red Team (automatic — before and after implementation)
Trigger automatically when the task involves: architecture decisions, database schema changes, auth/security changes, new features with >3 files, business logic that affects money or data integrity, or any decision the user is discussing with you that has multiple viable approaches.

**Before implementation:** Run a quick adversarial pass (inline, not a separate file). Four personas, 1 round, focused on: "What could go wrong?" and "What are we missing?" Surface the top 3-5 risks. **Fix the critical ones in your plan before building.**

**After implementation:** Run a second quick pass on the actual output. "Did we introduce any of the risks we identified? Did we miss anything new?" **Fix any issues found — don't just report them.**

The lite red team is inline conversation, not a document. It should take 30 seconds of thinking, not 10 minutes.

### Full Red Team (on request or for major decisions)
For major strategic decisions (business model, pricing, market entry, technology bets), run the full 4-persona, 4-6 round debate and produce the markdown document per the skill's standard format. Trigger on: user explicitly asks for red team / debate / stress test, OR the decision is high-stakes and irreversible.

### The key difference from standalone use
**Act on what the red team finds.** The debate is not the deliverable — the improved output is. If the Bear surfaces a real risk, fix it. If the Realist corrects a number, update the model. If the Disruptor reframes the question, reconsider the approach. The red team exists to make the work better, not to produce a document about the work.

---

## Use Subagents Liberally

- Offload research, file exploration, and parallel subtasks to subagents — keep the main context window clean and focused
- One task per subagent for focused execution
- Use subagents for: searching the codebase, reading reference docs, running tests, generating boilerplate
- The main thread should stay focused on decision-making and integration — delegate the grunt work
- **Plan-then-parallelise.** Enumerate every independent task up front and launch them all in a single multi-Agent message. Drip-feeding one sub-agent at a time wastes the parallelism sub-agents are for. If 5+ mockup ports are still queued, spawn 5+ agents at once.

### Parallel Sub-Agent Safety Rules (MANDATORY when 2+ agents run concurrently)

When two or more sub-agents work on the same branch at the same time, they can silently trample each other's commits. This has already happened in this repo — one agent's `git add -A` swept another agent's files into the wrong commit, resulting in a commit message that did not describe its contents. These rules exist because that outage was real, not hypothetical.

**Every sub-agent brief in a parallel run MUST include:**

1. **Stage only explicit named paths.** NEVER `git add -A` or `git add .`. Example: `git add src/app/.../cost/page.tsx src/app/.../cost/cost-view.tsx`. Name the files up front in the brief so the agent has a whitelist.
2. **Claim a single directory.** No two concurrent agents may write to the same directory. List-page + detail-page on the same resource = one agent, or explicit "stay out of /suppliers/*, only edit /suppliers/[id]/*".
3. **Never regenerate shared files.** `src/types/database.types.ts`, `package.json`, `package-lock.json`, `supabase/migrations/` (as a new file is fine; editing someone else's is not) are shared. Only ONE agent per parallel wave regenerates types or installs deps. Others explicitly must not.
4. **Never push.** Main thread pushes at the end of the wave. Sub-agents commit locally only. Keeps partial state out of Vercel previews.
5. **Block on ambiguity — don't guess.** If an agent hits a decision outside its brief (licensing question, schema change, API swap), STOP, write `<FEATURE>-HANDOVER.md` at repo root with 3 ranked options, and report back. Do NOT pick one and continue — the handover-doc pattern is what let DWG-licensing get answered in 30 seconds instead of a wrong-foot implementation.
6. **Atomic path-scoped commit.** Use `git commit --only <paths>` (NOT `git add <paths>` followed by `git commit`). The two-step flow opens a milliseconds-wide window where a sibling agent's `git commit` can fire between your stage and your commit, sweeping your files into THEIR commit under THEIR message. `git commit --only` stages + commits atomically against the path list, closing the window. Still pair with `git status --short` before and `git show HEAD --stat` immediately after — if another agent still beat you, your files may be at HEAD under their message (content correct, attribution wrong); flag this to the main thread rather than attempt `--amend` (banned per rule on shared branches).
7. **Use `--no-verify` for concurrent-agent commits.** The pre-commit lint hook runs the whole repo lint each time; when two agents try to commit in the same second, one races and fails. `--no-verify` on sub-agent commits is the pragmatic fix. Main thread does the full-repo verify once at the end before pushing.

### Sub-Agent Briefing Template (use all four parts)

Mockup-port agents that land cleanly always have these four sections in the brief:

1. **Mockup file path** — absolute, the V1 spec. "`/Users/tristanfischer/Developer/.../FORGE-MOCKUP-X.html`". Agent must open it and port top-to-bottom.
2. **Reference implementation path** — a sibling page already following the pattern. "See `bom-view.tsx` + `bom-v2.css` for the scoped-`.bm2` convention." Stops the agent from inventing a parallel convention.
3. **Data contract** — exact actions + tables + columns to read, what's nullable today, what doesn't exist yet. "`loadCadLabProject(id)` → `.modules[].keyParts` exists; `.parts_spec` does NOT exist." Prevents the agent from assuming fields.
4. **Empty-state policy** — "never fake mockup specifics; render honest 'not yet declared' when the field doesn't exist." This is the single most important clause. Without it, sub-agents happily render T800 prepreg / Astra Composites / £172k and the work reads as fake.

Plus the staging clause from rule 1–6 above. Brief without the staging clause = race condition on its way.

### When two terminals on the same repo are safe (and when they aren't)

Running a second terminal on ForgeOS can double throughput but adds failure modes neither session sees:

- **Safe:** Split by directory or by non-code work. Terminal A = `/the-forge-v2/**`, Terminal B = `/marketplace/**`. Or Terminal A = code, Terminal B = investor outreach / drafts. No file collision.
- **Safe:** Git worktrees. Each terminal on a separate branch in a separate worktree. Claude Code's Agent tool has `isolation: "worktree"` for exactly this case.
- **Dangerous:** Both terminals spawning sub-agents on the same branch for the same feature. The race described above, doubled. Don't.
- **Dangerous:** Both terminals running `npx supabase gen types` or `supabase db push` or `npm install` at once. Shared state gets clobbered silently.

Prefer one terminal running many parallel sub-agents (what this rulebook was written for) over two terminals each running a few.

---

## Agent Workflow

### Verification Before Done
- **Never mark a task complete without proving it works**
- **Test it yourself.** Write scripts, hit endpoints — whatever it takes. Only involve the user for genuine blockers.
- After any bug fix or UI change, run `npm run verify` before reporting done
  - Tier 1 (Static): `tsc --noEmit` + ESLint
  - Tier 2 (Smoke): Playwright page render check
  - For static-only: `npm run verify -- --static`
- Commit after each page's fixes are verified — not in a single batch
- **Log every fix to memory** — after each commit (pass or fail), add an entry to `~/.claude/projects/-Users-tristanfischer/memory/forgeos-fix-log.md` with: what was changed, did it work, why, and any gotchas. This is part of the definition of done.

### Per-Page Red-Team Visual Verification (NON-NEGOTIABLE)

For every page-level red-team pass, the code audit + fix is only half the work. Static analysis (sub-agent code audit, `tsc --noEmit`, ESLint, grep sweeps) will miss:

- Layout bugs (text overflow, cut-off content, awkward spacing)
- Hover / focus state contrast that looks wrong in the actual browser
- Loading / error states in motion (spinner placement, toast overlap)
- Click-through friction — how many scrolls + clicks to the primary action
- Regressions my own fix introduced

**Before committing a page-level fix, do an `agent-browser` walkthrough on localhost (or the just-deployed Vercel preview) with these mandatory steps:**

1. `agent-browser close --all` — avoid state collisions with other automated sessions.
2. `agent-browser open <url> --headless --viewport 1440x900` — desktop baseline.
3. `agent-browser snapshot` — read the accessibility tree; confirm the fix rendered.
4. `agent-browser screenshot /tmp/<page>-desktop.png` — read the screenshot for layout / overflow / contrast issues.
5. **If the change touched layout or mobile-specific code:** re-do at `--viewport 375x812` (iPhone SE width). Screenshot, read.
6. **If the change touched tabs, buttons, dialogs, or forms:** keyboard-tab through — confirm WAI-ARIA changes work in the rendered DOM (focus ring visible, arrow keys work, aria-selected flips).

**Log the result in the page's tracker entry as `Visual: ✓` or `Visual: ⚠ <issue found>`.** If ⚠, fix the issue in the same commit (or a fast follow-up) before moving to the next page.

**Skip only when:** the change is pure back-end / migration / types with no rendered-surface impact. Otherwise this is mandatory.

**Why:** `tsc` says the code compiles. ESLint says it parses. Only the browser says the founder will be delighted. The "Always Use agent-browser" rule in the global CLAUDE.md is easy to drift from mid-sweep — this project-level clause makes it explicit for page red-teams.

### Bug Fixing Strategy
1. First attempt: analyze and try a direct fix
2. If "still doesn't work": STOP. Switch to Plan Mode. Re-analyze assumptions. Create debugging plan. Write reproducing test. Prove fix works.
- Only ONE attempt before escalating to plan mode

### Supabase Is Your Job — ZERO EXCEPTIONS

**You have FULL ACCESS to Supabase. You can and MUST do ALL database operations yourself. NEVER ask the user to run Supabase commands. NEVER say "you'll need to apply this migration" or "run npx supabase db push when you're back." YOU run it. NOW.**

This includes but is not limited to:
1. **Push migrations:** `npx supabase db push` — run it immediately after creating a migration file. Do not create a migration and leave it unapplied.
2. **Regenerate types:** `npx supabase gen types typescript --linked 2>/dev/null > src/types/database.types.ts` — run after every migration push.
3. **Query production data:** Use the Supabase Management API or CLI when needed.
4. **Check migration status:** `npx supabase migration list --linked`
5. **Verify schema:** `npx tsc --noEmit` after type regeneration.

**The workflow is: write migration → push migration → regenerate types → verify types → commit. All in one go. No handoffs.**

If a migration fails, debug it and fix it. Do not leave broken or unapplied migrations for the user. The user does not write code and should never need to touch the terminal for database operations.

---

## Company Identity
- **CORRECT:** "Fractional Forge" (company), "ForgeOS" (product), "Forge teams" (users)
- **WRONG:** Centaur Dynamics, CentaurOS, Centaur teams
- Apply to: page titles, UI copy, meta tags, documentation
- Do NOT change: git repo URLs, migration files, foundry IDs, font/image filenames, Sentry project, Docker names

---

## Design Philosophy
Bright, airy, optimistic design reflecting human-AI collaboration.
- **Light-first:** default light backgrounds, dark mode as opt-in alternative
- **Bright palette:** International Orange #ff4500, Electric Blue #3b82f6, light tones, vibrant status colors
- **Airy spacing:** generous whitespace, prefer space-y-6/8, ample card padding
- **Optimistic messaging:** positive language, progress prominence, helpful errors, encouraging empty states
- ThemeProvider MUST default to light mode with `enableSystem={false}`

### No AI Emphasis
ForgeOS is human-first. AI capabilities support humans, not showcased.
- NO "AI-powered", "AI-generated", "Smart", "Intelligent" labels
- NO AI agent counts, AI branding in nav, robot/brain icons
- Test: "Would this description make sense without mentioning AI?" If yes, don't mention AI.

### Delight the User
Every feature should delight users enough they want to tell friends.
- Feels Instant: optimistic UI, skeleton states, transitions not jumps
- Feels Thoughtful: smart defaults, helpful microcopy, anticipate next step, graceful errors
- Feels Beautiful: consistent spacing, smooth interactions, purposeful color

---

## Color System
**NEVER use hardcoded colors — always use semantic tokens.**

### Text Colors
- Primary: `text-foreground` | Secondary: `text-muted-foreground` | Accent/Links: `text-international-orange`
- Success: `text-success` | Warning: `text-warning` | Error: `text-destructive` | Info: `text-info`

### Background Colors
- Page: `bg-background` | Card: `bg-card` | Secondary: `bg-secondary` | Muted: `bg-muted`
- Brand: `bg-international-orange` | Success: `bg-success/10` | Warning: `bg-warning/10` | Error: `bg-destructive/10`

### Borders
- Default: `border-border` | Input: `border-input` | Accent: `border-international-orange` | Error: `border-destructive`

### Forbidden
No `text-gray-*`, `bg-gray-*`, `text-white`, `bg-white`, `text-black`, `bg-black`, `text-red-*`, `bg-green-*`, `text-blue-*`, hardcoded hex values, etc.

Run `./scripts/check-design-tokens.sh` before committing UI changes.

---

## Component Patterns

### Required Components
- **Badge:** Use variants (success, warning, destructive, info), NOT custom classes
- **Button:** Semantic variants (default, secondary, ghost, destructive, success, warning). One primary per page.
- **Card:** Always use Card component (not custom divs). Card/CardHeader/CardContent/CardFooter. NO padding or border overrides.
- **Dialog:** Size prop (sm/md/lg), NOT custom widths. Footer: Cancel left, Submit right.
- **CRITICAL: NEVER use Sheet/Side Panels** — use centered Dialog instead
- **EmptyState:** For zero-data views with icon, title, description, optional action
- **StatusBadge:** For all status indicators (NOT Badge with hardcoded colors)
- **Skeleton:** For loading states

### UserAvatar (CRITICAL)
ALL user avatars MUST use `UserAvatar` component from `@/components/ui/user-avatar`.
- Role-based colors: Founder (dark orange), Executive (light orange), Apprentice (neutral), AI_Agent (purple)
- Sizes: xs(h-4), sm(h-6), md(h-8), lg(h-10), xl(h-14), 2xl(h-20), 3xl(h-24)
- Use `UserAvatarStack` for multiple avatars
- Raw Avatar ONLY for non-user entities

### Task Completion Icons
- CheckCircle2 (green): completed tasks ONLY
- Clock: active/in-progress with upcoming deadlines
- AlertTriangle: overdue tasks
- Circle (outline): incomplete/pending

### Wizard Pattern (3+ fields)
Use multi-step wizard with: visual progress indicator, conversational typography, one focus per step, step validation, clear navigation (Cancel/Back left, Next/Submit right), character counters, focus management. Reference: `src/components/objectives/company-purpose-dialog.tsx`

---

## Layout & Spacing
- Platform pages inherit padding from layout — NO duplicate padding
- Layout provides: `p-4 sm:p-6 lg:p-8`
- Max-width: none for list/grid, `max-w-5xl` detail, `max-w-3xl` forms, `max-w-4xl` settings, `max-w-7xl` marketing
- Spacing scale: section(space-y-8), card(space-y-6), stack(space-y-4), stackTight(space-y-2)

### Z-Index Hierarchy
- `z-40`: Sticky headers, floating buttons
- `z-50`: Sheet/Dialog/Drawer overlays & content
- `z-[200]`: Popover/Select/Combobox/Command inside modals
- `z-[300]`: Tooltip (always on top)
- DO NOT use `z-[100]` or create wrapper divs with different z-index

### No Subpixel Blur
- FORBIDDEN: `left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2` (causes fuzzy text)
- USE: `inset-0 m-auto h-fit w-fit` or flexbox centering

### Interactive Elements
All dialogs, dropdowns, popovers MUST have solid opaque backgrounds.
- FORBIDDEN: `bg-background/80`, `bg-background/90`, `bg-card/50`, `backdrop-blur` on interactive elements
- Transparency allowed ONLY on modal backdrop overlay (`bg-black/40`)

---

## Navigation
- Active state: International Orange ONLY (`text-international-orange font-semibold`)
- Typography: `text-sm font-medium` desktop, `text-xs font-medium` mobile
- Icons: `h-4 w-4` desktop sidebar, `h-5 w-5` mobile
- Hover: `transition-colors duration-200`

---

## Forms
- Every field: Label with htmlFor, aria-required, aria-invalid, aria-describedby, role="alert" on errors
- Input height: default h-10 (NO overrides)
- Error styling: semantic `destructive` token, NOT hardcoded red
- Validation: inline on blur, clear on change, focus first error on submit
- Spacing: use design system utilities (spacing.section, spacing.card, spacing.stack)

---

## Code Standards

### TypeScript
- Explicit types for function signatures
- Avoid `any` — use `unknown` + type guards
- Use `satisfies` for type-safe object literals

### Naming Conventions
- Files: kebab-case | Functions: camelCase | Types/Interfaces: PascalCase
- Constants: UPPER_SNAKE_CASE | Booleans: is/has/should prefix | Handlers: handle* | Callbacks: on*

### Error Handling
- Never silent catch — always log or rethrow
- Create typed custom error classes
- Never return undefined/null without logging

### Imports (order)
1. React/Next.js 2. External 3. Internal aliases (@/) 4. Relative 5. Type imports

---

## Database Security (CRITICAL)
Multi-tenant SaaS — foundry isolation at ALL times.

**ALL queries for multi-tenant tables MUST filter by foundry_id.**

Multi-tenant tables: tasks, objectives, teams, messages, task_comments, task_assignees, profiles, foundries

Secure pattern:
1. Get authenticated user via `createClient()` + `getUser()`
2. Get user's profile with foundry_id
3. Filter ALL queries by foundry_id
4. Never trust client-side foundry_id — always derive from auth

RLS is ENABLED on profiles (as of migration 20260216800000). Three canonical policies: INSERT for own profile, UPDATE for own profile, SELECT USING (true) — intentionally permissive to support cross-foundry marketplace/messaging visibility. R-011 in ISMS risk register documents the accepted risk.

---

## Documentation
- JSDoc required for all exported functions: @description, @param, @returns, @throws
- Security comments: `// SECURITY:`, `// AUTH:`, `// AUDIT:`, `// RLS:`, `// VALIDATION:`
- Business logic: comment the WHY, reference tickets
- File headers required for: API routes, files >200 lines, security-critical, migrations

### Code Narrative Annotations
- `// INTENT:` — why this code exists
- `// DECISION:` — why this approach over alternatives
- `// TRIED:` — what was attempted and abandoned
- `// FLOW:` — cross-file connection breadcrumbs
- `// GOTCHA:` — what looks wrong but is correct

---

## Elegance Patterns
- Interactive cards: `hover:-translate-y-0.5 active:scale-[0.99] duration-200`
- Section headers: colored accent bars matching content theme
- Empty states: soft centered with icon in rounded container
- List rows: soft hover transition
- Icon containers: branded background with /10 opacity
- Selection states: brand-colored ring
- Always provide color legends when using colored UI elements

---

## Testing Before Deployment
Any code change requires end-to-end testing before deployment:
1. Code-Level: TypeScript, Linter, Build
2. Functional: UI components, server actions, API routes
3. Regression: test related features
- Test ALL instances of a pattern if modifying one
- Run `./scripts/check-design-tokens.sh` before committing UI changes

---

## Color Legends
Always provide legends when using colored UI elements. Use StatusItem interface pattern. Place below page headers, above filterable content.

---

## Specialist Configuration Protocol

AI specialist quality is the core product differentiator. Changes to specialist configs require disciplined, measurable iteration — not vibes.

### Never Modify Blind
- **NEVER change a specialist's personality config without running the benchmark suite first.** Baseline scores before, iteration scores after, compare to decide keep/discard.
- Benchmark infrastructure: `experiments/autoagent-strategy-specialist/benchmark/runner.py`
- Run: `ANTHROPIC_API_KEY=<key> python runner.py --specialist <id> --mode baseline --label <name>`
- Compare: `python runner.py --mode compare --baseline results/before.json --current results/after.json`

### One Mutation at a Time
- Change ONE thing per iteration: opening behavior, a single rule, a quirk, a workflow template.
- Score on the 4-dimension rubric: Actionability, Specificity, Strategic Depth, Voice Consistency.
- Keep/discard rules: Composite ≥ +0.2 → keep. Composite ≤ -0.2 → discard. Voice hard floor at 4.0.
- If voice drops below 4.0, discard regardless of other gains.

### Voice Sandwich (Mandatory for Workflow Templates)
Every specialist workflow output MUST follow the Voice Sandwich pattern:
1. **Bold opener** — specialist identity line + confident-uncertainty take
2. **Structured body** — every section ends with a `SO WHAT:` implication line
3. **Domain-specific action close** — actionable next steps using the specialist's signature close format (e.g., Sage: "WHAT TO DO MONDAY MORNING:", Finn: "THE NUMBERS THAT MATTER:", Sal: "SEND THIS TODAY:")

### Cross-Specialist Principles (Applied to All 13)
- **Confident uncertainty**: Lead with a decisive take, immediately name the assumption that could flip it
- **Rules of Engagement**: Every specialist has domain-specific quality rules compiled into their prompt via `rulesOfEngagement[]` in the personality config
- **Compiler verification**: When adding any new field to `AgentInteractionStyle`, verify that `compilePersonalityPrompt()` in `personality.ts` actually renders it. Interface fields without compiler support are dead code.

### Config Interface Integrity Rule
Any time a field is added to a config interface (not just personality — any interface), grep for where it's consumed, not just where it's defined. An interface field without a consumer is a bug, not a feature.

### Baseline Scores (April 5, 2026 — Post-Optimization, All 13 Specialists)
Live API benchmarks (claude-sonnet-4-20250514, LLM-as-judge). 5 AutoAgent mutation cycles per specialist. Any personality change must not drop composite below these baselines minus 0.2.

| Specialist | ID | Composite | Action. | Spec. | Depth | Voice | Scenarios |
|---|---|---|---|---|---|---|---|
| Sage (Strategy) | strategist | **4.40** | 4.30 | 4.20 | 4.40 | 4.67 | 20 |
| Max (CTO) | cto | **4.46** | 4.30 | 4.20 | 4.50 | 4.85 | 10 |
| Jian (VP Eng) | vp-engineering | **4.38** | 4.20 | 4.20 | 4.25 | 4.85 | 10 |
| Fang (VP Mfg) | vp-manufacturing | **4.33** | 4.40 | 4.15 | 4.25 | 4.50 | 10 |
| Chase (VP Supply) | vp-supply-chain | **4.39** | 4.40 | 4.35 | 4.20 | 4.60 | 10 |
| Priya (Product) | product-lead | **4.37** | 4.55 | 4.15 | 4.35 | 4.40 | 10 |
| Mia (Marketing) | growth-marketer | **4.35** | 4.50 | 4.05 | 4.40 | 4.45 | 10 |
| Sal (Sales) | sales-lead | **4.42** | 4.55 | 4.30 | 4.25 | 4.65 | 10 |
| Cal (Chief of Staff) | chief-of-staff | **4.35** | 4.50 | 4.05 | 4.25 | 4.55 | 10 |
| Finn (Finance) | finance-lead | **4.39** | 4.45 | 4.40 | 4.20 | 4.50 | 10 |
| Fiona (Fundraising) | fundraising-advisor | **4.39** | 4.25 | 4.25 | 4.35 | 4.70 | 10 |
| Harper (HR) | hiring-team | **4.29** | 4.40 | 4.15 | 4.25 | 4.35 | 10 |
| Leo (Legal) | legal-counsel | **4.38** | 4.55 | 4.10 | 4.25 | 4.65 | 10 |

**Fleet average: 4.38 composite (+0.04 from pre-optimization).** Top: Max (4.46), Sal (4.42), Sage (4.40). Most improved: Priya (+0.12), Chase (+0.10), Sal (+0.08), Leo (+0.08).

**DeepSeek V4 re-benchmark (April 7, 2026):** 4 specialists switched from Sonnet to DeepSeek V4 after cross-model benchmarking showed consistent improvement. Max (CTO): 4.46 -> 4.54 (+0.08), Jian (VP Eng): 4.38 -> 4.45 (+0.07), Fang (VP Mfg): 4.33 -> 4.47 (+0.14), Priya (Product): 4.37 -> 4.51 (+0.14). Fallback chain: deepseek -> sonnet -> gemini-flash -> minimax -> gpt-5.4.

---

## Session End Checklist (MANDATORY)

**Before ending any session, you MUST run this checklist. No exceptions.**

1. **Re-read the original request.** What exactly was asked? List every item.
2. **For each item, answer:** Done? Partially done? Blocked? Skipped? If not done, why?
3. **If anything is incomplete:** either finish it now or document it clearly (what's left, why, how to pick it up).
4. **Verify your work:** lint, type check, test — don't claim "done" without proof.
5. **Uncommitted changes?** If changes are ready, ask the user if they want them committed and pushed.
6. **Handover needed?** If items remain, write or update a handover/tracker doc so the next session can pick up cleanly.

**Ask yourself: "If the user reads only my final message, will they know the exact state of everything they asked for?"** If not, your summary is incomplete.

<!-- autoskills:start -->

Summary generated by `autoskills`. Check the full files inside `.claude/skills`.

## Accessibility (a11y)

Audit and improve web accessibility following WCAG 2.2 guidelines. Use when asked to "improve accessibility", "a11y audit", "WCAG compliance", "screen reader support", "keyboard navigation", or "make accessible".

- `.claude/skills/accessibility/SKILL.md`
- `.claude/skills/accessibility/references/A11Y-PATTERNS.md`: Practical, copy-paste-ready patterns for common accessibility requirements. Each pattern is self-contained and linked from the main [SKILL.md](../SKILL.md).
- `.claude/skills/accessibility/references/WCAG.md`

## Deploy to Vercel

Deploy applications and websites to Vercel. Use when the user requests deployment actions like "deploy my app", "deploy and give me the link", "push this live", or "create a preview deployment".

- `.claude/skills/deploy-to-vercel/SKILL.md`

## Design Thinking

Create distinctive, production-grade frontend interfaces with high design quality. Use this skill when the user asks to build web components, pages, artifacts, posters, or applications (examples include websites, landing pages, dashboards, React components, HTML/CSS layouts, or when styling/beaut...

- `.claude/skills/frontend-design/SKILL.md`

## Next.js Best Practices

Next.js best practices - file conventions, RSC boundaries, data patterns, async APIs, metadata, error handling, route handlers, image/font optimization, bundling

- `.claude/skills/next-best-practices/SKILL.md`
- `.claude/skills/next-best-practices/async-patterns.md`: In Next.js 15+, `params`, `searchParams`, `cookies()`, and `headers()` are asynchronous.
- `.claude/skills/next-best-practices/bundling.md`: Fix common bundling issues with third-party packages.
- `.claude/skills/next-best-practices/data-patterns.md`: Choose the right data fetching pattern for each use case.
- `.claude/skills/next-best-practices/debug-tricks.md`: Tricks to speed up debugging Next.js applications.
- `.claude/skills/next-best-practices/directives.md`: These are React directives, not Next.js specific.
- `.claude/skills/next-best-practices/error-handling.md`: Handle errors gracefully in Next.js applications.
- `.claude/skills/next-best-practices/file-conventions.md`: Next.js App Router uses file-based routing with special file conventions.
- `.claude/skills/next-best-practices/font.md`: Use `next/font` for automatic font optimization with zero layout shift.
- `.claude/skills/next-best-practices/functions.md`: Next.js function APIs.
- `.claude/skills/next-best-practices/hydration-error.md`: Diagnose and fix React hydration mismatch errors.
- `.claude/skills/next-best-practices/image.md`: Use `next/image` for automatic image optimization.
- `.claude/skills/next-best-practices/metadata.md`: Add SEO metadata to Next.js pages using the Metadata API.
- `.claude/skills/next-best-practices/parallel-routes.md`: Parallel routes render multiple pages in the same layout. Intercepting routes show a different UI when navigating from within your app vs direct URL access. Together they enable modal patterns.
- `.claude/skills/next-best-practices/route-handlers.md`: Create API endpoints with `route.ts` files.
- `.claude/skills/next-best-practices/rsc-boundaries.md`: Detect and prevent invalid patterns when crossing Server/Client component boundaries.
- `.claude/skills/next-best-practices/runtime-selection.md`: Use the default Node.js runtime for new routes and pages. Only use Edge runtime if the project already uses it or there's a specific requirement.
- `.claude/skills/next-best-practices/scripts.md`: Loading third-party scripts in Next.js.
- `.claude/skills/next-best-practices/self-hosting.md`: Deploy Next.js outside of Vercel with confidence.
- `.claude/skills/next-best-practices/suspense-boundaries.md`: Client hooks that cause CSR bailout without Suspense boundaries.

## Cache Components (Next.js 16+)

Next.js 16 Cache Components - PPR, use cache directive, cacheLife, cacheTag, updateTag

- `.claude/skills/next-cache-components/SKILL.md`

## Upgrade Next.js

Upgrade Next.js to the latest version following official migration guides and codemods

- `.claude/skills/next-upgrade/SKILL.md`

## Node.js Backend Patterns

Build production-ready Node.js backend services with Express/Fastify, implementing middleware patterns, error handling, authentication, database integration, and API design best practices. Use when creating Node.js servers, REST APIs, GraphQL backends, or microservices architectures.

- `.claude/skills/nodejs-backend-patterns/SKILL.md`
- `.claude/skills/nodejs-backend-patterns/references/advanced-patterns.md`: Advanced patterns for dependency injection, database integration, authentication, caching, and API response formatting.

## Node.js Best Practices

Node.js development principles and decision-making. Framework selection, async patterns, security, and architecture. Teaches thinking, not copying.

- `.claude/skills/nodejs-best-practices/SKILL.md`

## Playwright Best Practices

Use when writing Playwright tests, fixing flaky tests, debugging failures, implementing Page Object Model, configuring CI/CD, optimizing performance, mocking APIs, handling authentication or OAuth, testing accessibility (axe-core), file uploads/downloads, date/time mocking, WebSockets, geolocatio...

- `.claude/skills/playwright-best-practices/SKILL.md`
- `.claude/skills/playwright-best-practices/advanced/authentication-flows.md`: Intercept API responses to capture verification tokens for testing:
- `.claude/skills/playwright-best-practices/advanced/authentication.md`: **Use when**: You need authenticated tests and want to avoid logging in before every test. **Avoid when**: Tests require completely fresh sessions, or you are testing the login flow itself.
- `.claude/skills/playwright-best-practices/advanced/clock-mocking.md`
- `.claude/skills/playwright-best-practices/advanced/mobile-testing.md`
- `.claude/skills/playwright-best-practices/advanced/multi-context.md`: This file covers **single-user scenarios** with multiple browser tabs, windows, and popups. For **multi-user collaboration testing** (multiple users interacting simultaneously), see [multi-user.md](multi-user.md).
- `.claude/skills/playwright-best-practices/advanced/multi-user.md`
- `.claude/skills/playwright-best-practices/advanced/network-advanced.md`: Use `context.setOffline(true/false)` to simulate network connectivity changes.
- `.claude/skills/playwright-best-practices/advanced/third-party.md`
- `.claude/skills/playwright-best-practices/architecture/pom-vs-fixtures.md`: Use all three patterns together. Most projects benefit from a hybrid approach:
- `.claude/skills/playwright-best-practices/architecture/test-architecture.md`: **Ideal for**:
- `.claude/skills/playwright-best-practices/architecture/when-to-mock.md`: **Mock at the boundary, test your stack end-to-end.** Mock third-party services you don't own (payment gateways, email providers, OAuth). Never mock your own frontend-to-backend communication. Tests should prove YOUR code works, not that third-party APIs are available.
- `.claude/skills/playwright-best-practices/browser-apis/browser-apis.md`
- `.claude/skills/playwright-best-practices/browser-apis/iframes.md`
- `.claude/skills/playwright-best-practices/browser-apis/service-workers.md`: This section covers **offline-first apps (PWAs)** that are designed to work offline using service workers, caching, and background sync. For testing **unexpected network failures** (error recovery, graceful degradation), see [error-testing.md](error-testing.md#offline-testing).
- `.claude/skills/playwright-best-practices/browser-apis/websockets.md`
- `.claude/skills/playwright-best-practices/core/annotations.md`
- `.claude/skills/playwright-best-practices/core/assertions-waiting.md`: Auto-retry until condition is met or timeout. Always prefer these over generic assertions.
- `.claude/skills/playwright-best-practices/core/configuration.md`: **Use when**: Tests run against dev, staging, and production environments.
- `.claude/skills/playwright-best-practices/core/fixtures-hooks.md`: Created fresh for each test:
- `.claude/skills/playwright-best-practices/core/global-setup.md`: This section covers **one-time database setup** (migrations, snapshots, per-worker databases). For related topics:
- `.claude/skills/playwright-best-practices/core/locators.md`: Use locators in this order of preference:
- `.claude/skills/playwright-best-practices/core/page-object-model.md`: Page Object Model encapsulates page structure and interactions, providing:
- `.claude/skills/playwright-best-practices/core/projects-dependencies.md`: Setup projects are the recommended way to handle authentication. They run before your main test projects and can use Playwright fixtures.
- `.claude/skills/playwright-best-practices/core/test-data.md`: This file covers **reusable test data builders** (factories, Faker, data generators). For related topics:
- `.claude/skills/playwright-best-practices/core/test-suite-structure.md`: Full user journey tests through the browser.
- `.claude/skills/playwright-best-practices/core/test-tags.md`
- `.claude/skills/playwright-best-practices/debugging/console-errors.md`
- `.claude/skills/playwright-best-practices/debugging/debugging.md`: Features:
- `.claude/skills/playwright-best-practices/debugging/error-testing.md`: This section covers **unexpected network failures** and error recovery. For **offline-first apps (PWAs)** with service workers, caching, and background sync, see [service-workers.md](service-workers.md#offline-testing).
- `.claude/skills/playwright-best-practices/debugging/flaky-tests.md`: Most flaky tests fall into distinct categories requiring different remediation:
- `.claude/skills/playwright-best-practices/frameworks/angular.md`: Angular generates internal attributes (`_ngcontent-*`, `_nghost-*`, `ng-reflect-*`) that change every build. Always use semantic locators.
- `.claude/skills/playwright-best-practices/frameworks/nextjs.md`: Next.js loads `.env.test` when `NODE_ENV=test`:
- `.claude/skills/playwright-best-practices/frameworks/react.md`: **Use when**: Verifying React context (theme, auth, locale) and state management (Redux, Zustand) produce correct UI changes. **Avoid when**: You want to assert on raw state objects—test the UI, not internal state.
- `.claude/skills/playwright-best-practices/frameworks/vue.md`: Nuxt uses port 3000 and requires a build step before testing.
- `.claude/skills/playwright-best-practices/infrastructure-ci-cd/ci-cd.md`
- `.claude/skills/playwright-best-practices/infrastructure-ci-cd/docker.md`: Run tests without building a custom image:
- `.claude/skills/playwright-best-practices/infrastructure-ci-cd/github-actions.md`: **Use when**: Starting a new project or running a small test suite.
- `.claude/skills/playwright-best-practices/infrastructure-ci-cd/gitlab.md`: **Use when**: Any GitLab project with Playwright tests.
- `.claude/skills/playwright-best-practices/infrastructure-ci-cd/other-providers.md`: All platforms benefit from JUnit output for native test result display:
- `.claude/skills/playwright-best-practices/infrastructure-ci-cd/parallel-sharding.md`: **Use when**: Controlling concurrent test execution on a single machine.
- `.claude/skills/playwright-best-practices/infrastructure-ci-cd/performance.md`: Tests are distributed evenly by file. For optimal sharding:
- `.claude/skills/playwright-best-practices/infrastructure-ci-cd/reporting.md`: Build custom reporters for Slack notifications, database logging, or dashboards.
- `.claude/skills/playwright-best-practices/infrastructure-ci-cd/test-coverage.md`
- `.claude/skills/playwright-best-practices/LICENSE.md`: Copyright © 2026 Currents Software Inc.
- `.claude/skills/playwright-best-practices/README.md`: <img src="https://currents.dev/favicon-96x96.png" width="24" height="24" align="left" />by [currents.dev](https://currents.dev?utm_source=ai-skill) - The all-in-one Dashboard for Playwright Testing.
- `.claude/skills/playwright-best-practices/testing-patterns/accessibility.md`
- `.claude/skills/playwright-best-practices/testing-patterns/api-testing.md`: **Use when**: Multiple tests need an authenticated API client with shared configuration. **Avoid when**: A single test makes one-off API calls — use the built-in `request` fixture directly.
- `.claude/skills/playwright-best-practices/testing-patterns/browser-extensions.md`
- `.claude/skills/playwright-best-practices/testing-patterns/canvas-webgl.md`
- `.claude/skills/playwright-best-practices/testing-patterns/component-testing.md`
- `.claude/skills/playwright-best-practices/testing-patterns/drag-drop.md`: Some drag libraries (react-beautiful-dnd, dnd-kit) require incremental mouse movements:
- `.claude/skills/playwright-best-practices/testing-patterns/electron.md`
- `.claude/skills/playwright-best-practices/testing-patterns/file-operations.md`
- `.claude/skills/playwright-best-practices/testing-patterns/file-upload-download.md`: Drop zones always have an underlying `input[type="file"]`—target it directly instead of simulating OS-level drag events.
- `.claude/skills/playwright-best-practices/testing-patterns/forms-validation.md`: **Use when**: Testing search fields, address lookups, mention pickers, or any input that shows suggestions as the user types.
- `.claude/skills/playwright-best-practices/testing-patterns/graphql-testing.md`: All GraphQL requests go through `POST` to a single endpoint. Send `query`, `variables`, and optionally `operationName` in the JSON body.
- `.claude/skills/playwright-best-practices/testing-patterns/i18n.md`
- `.claude/skills/playwright-best-practices/testing-patterns/performance-testing.md`
- `.claude/skills/playwright-best-practices/testing-patterns/security-testing.md`
- `.claude/skills/playwright-best-practices/testing-patterns/visual-regression.md`: **Use when**: Page contains timestamps, avatars, ad slots, relative dates, random images, or A/B variants.

## @json-render/react-three-fiber

React Three Fiber 3D renderer for json-render. Use when working with @json-render/react-three-fiber, building 3D scenes from JSON specs, rendering meshes/lights/models/environments, or integrating Three.js with json-render catalogs.

- `.claude/skills/react-three-fiber/SKILL.md`

## SEO optimization

Optimize for search engine visibility and ranking. Use when asked to "improve SEO", "optimize for search", "fix meta tags", "add structured data", "sitemap optimization", or "search engine optimization".

- `.claude/skills/seo/SKILL.md`

## shadcn/ui

Manages shadcn components and projects — adding, searching, fixing, debugging, styling, and composing UI. Provides project context, component docs, and usage examples. Applies when working with shadcn/ui, component registries, presets, --preset codes, or any project with a components.json file. A...

- `.claude/skills/shadcn/SKILL.md`
- `.claude/skills/shadcn/cli.md`: Configuration is read from `components.json`.
- `.claude/skills/shadcn/customization.md`: Components reference semantic CSS variable tokens. Change the variables to change every component.
- `.claude/skills/shadcn/mcp.md`: The CLI includes an MCP server that lets AI assistants search, browse, view, and install components from registries.
- `.claude/skills/shadcn/rules/base-vs-radix.md`: API differences between `base` and `radix`. Check the `base` field from `npx shadcn@latest info`.
- `.claude/skills/shadcn/rules/composition.md`: Never render items directly inside the content container.
- `.claude/skills/shadcn/rules/forms.md`: Always use `FieldGroup` + `Field` — never raw `div` with `space-y-*`:
- `.claude/skills/shadcn/rules/icons.md`: **Always use the project's configured `iconLibrary` for imports.** Check the `iconLibrary` field from project context: `lucide` → `lucide-react`, `tabler` → `@tabler/icons-react`, etc. Never assume `lucide-react`.
- `.claude/skills/shadcn/rules/styling.md`: See [customization.md](../customization.md) for theming, CSS variables, and adding custom colors.

## Integration routing

>-

- `.claude/skills/stripe-best-practices/SKILL.md`
- `.claude/skills/stripe-best-practices/references/billing.md`: If the user has a recurring revenue model (subscriptions, usage-based billing, seat-based pricing), use the Billing APIs to [plan their integration](https://docs.stripe.com/billing/subscriptions/design-an-integration.md) instead of a direct PaymentIntent integration.
- `.claude/skills/stripe-best-practices/references/connect.md`: For new Connect platforms, ALWAYS use the [Accounts v2 API](https://docs.stripe.com/connect/accounts-v2.md) (`POST /v2/core/accounts`). This is Stripe’s actively invested path and ensures long-term support.
- `.claude/skills/stripe-best-practices/references/payments.md`: Use the [Checkout Sessions API](https://docs.stripe.com/api/checkout/sessions.md) (`checkout.sessions.create`) for on-session payments. It supports one-time payments and subscriptions and handles taxes, discounts, shipping, and adaptive pricing automatically.
- `.claude/skills/stripe-best-practices/references/security.md`: Never include keys in source code. You might find example code like `client = new Stripe("sk_...")` that are for illustration only. Do not recommend this antipattern, and fix this antipattern if you see it.
- `.claude/skills/stripe-best-practices/references/treasury.md`: For embedded financial accounts (bank accounts, account and routing numbers, money movement), use the [v2 Financial Accounts API](https://docs.stripe.com/api/v2/core/vault/financial-accounts.md) (`POST /v2/core/vault/financial_accounts`). This is required for new integrations.

## Supabase Postgres Best Practices

Postgres performance optimization and best practices from Supabase. Use this skill when writing, reviewing, or optimizing Postgres queries, schema designs, or database configurations.

- `.claude/skills/supabase-postgres-best-practices/SKILL.md`
- `.claude/skills/supabase-postgres-best-practices/references/_contributing.md`: This document provides guidelines for creating effective Postgres best practice references that work well with AI agents and LLMs.
- `.claude/skills/supabase-postgres-best-practices/references/_sections.md`: This file defines the rule categories for Postgres best practices. Rules are automatically assigned to sections based on their filename prefix.
- `.claude/skills/supabase-postgres-best-practices/references/_template.md`: [1-2 sentence explanation of the problem and why it matters. Focus on performance impact.]
- `.claude/skills/supabase-postgres-best-practices/references/advanced-full-text-search.md`: LIKE with wildcards can't use indexes. Full-text search with tsvector is orders of magnitude faster.
- `.claude/skills/supabase-postgres-best-practices/references/advanced-jsonb-indexing.md`: JSONB queries without indexes scan the entire table. Use GIN indexes for containment queries.
- `.claude/skills/supabase-postgres-best-practices/references/conn-idle-timeout.md`: Idle connections waste resources. Configure timeouts to automatically reclaim them.
- `.claude/skills/supabase-postgres-best-practices/references/conn-limits.md`: Too many connections exhaust memory and degrade performance. Set limits based on available resources.
- `.claude/skills/supabase-postgres-best-practices/references/conn-pooling.md`: Postgres connections are expensive (1-3MB RAM each). Without pooling, applications exhaust connections under load.
- `.claude/skills/supabase-postgres-best-practices/references/conn-prepared-statements.md`: Prepared statements are tied to individual database connections. In transaction-mode pooling, connections are shared, causing conflicts.
- `.claude/skills/supabase-postgres-best-practices/references/data-batch-inserts.md`: Individual INSERT statements have high overhead. Batch multiple rows in single statements or use COPY.
- `.claude/skills/supabase-postgres-best-practices/references/data-n-plus-one.md`: N+1 queries execute one query per item in a loop. Batch them into a single query using arrays or JOINs.
- `.claude/skills/supabase-postgres-best-practices/references/data-pagination.md`: OFFSET-based pagination scans all skipped rows, getting slower on deeper pages. Cursor pagination is O(1).
- `.claude/skills/supabase-postgres-best-practices/references/data-upsert.md`: Using separate SELECT-then-INSERT/UPDATE creates race conditions. Use INSERT ... ON CONFLICT for atomic upserts.
- `.claude/skills/supabase-postgres-best-practices/references/lock-advisory.md`: Advisory locks provide application-level coordination without requiring database rows to lock.
- `.claude/skills/supabase-postgres-best-practices/references/lock-deadlock-prevention.md`: Deadlocks occur when transactions lock resources in different orders. Always acquire locks in a consistent order.
- `.claude/skills/supabase-postgres-best-practices/references/lock-short-transactions.md`: Long-running transactions hold locks that block other queries. Keep transactions as short as possible.
- `.claude/skills/supabase-postgres-best-practices/references/lock-skip-locked.md`: When multiple workers process a queue, SKIP LOCKED allows workers to process different rows without waiting.
- `.claude/skills/supabase-postgres-best-practices/references/monitor-explain-analyze.md`: EXPLAIN ANALYZE executes the query and shows actual timings, revealing the true performance bottlenecks.
- `.claude/skills/supabase-postgres-best-practices/references/monitor-pg-stat-statements.md`: pg_stat_statements tracks execution statistics for all queries, helping identify slow and frequent queries.
- `.claude/skills/supabase-postgres-best-practices/references/monitor-vacuum-analyze.md`: Outdated statistics cause the query planner to make poor decisions. VACUUM reclaims space, ANALYZE updates statistics.
- `.claude/skills/supabase-postgres-best-practices/references/query-composite-indexes.md`: When queries filter on multiple columns, a composite index is more efficient than separate single-column indexes.
- `.claude/skills/supabase-postgres-best-practices/references/query-covering-indexes.md`: Covering indexes include all columns needed by a query, enabling index-only scans that skip the table entirely.
- `.claude/skills/supabase-postgres-best-practices/references/query-index-types.md`: Different index types excel at different query patterns. The default B-tree isn't always optimal.
- `.claude/skills/supabase-postgres-best-practices/references/query-missing-indexes.md`: Queries filtering or joining on unindexed columns cause full table scans, which become exponentially slower as tables grow.
- `.claude/skills/supabase-postgres-best-practices/references/query-partial-indexes.md`: Partial indexes only include rows matching a WHERE condition, making them smaller and faster when queries consistently filter on the same condition.
- `.claude/skills/supabase-postgres-best-practices/references/schema-constraints.md`: PostgreSQL does not support `ADD CONSTRAINT IF NOT EXISTS`. Migrations using this syntax will fail.
- `.claude/skills/supabase-postgres-best-practices/references/schema-data-types.md`: Using the right data types reduces storage, improves query performance, and prevents bugs.
- `.claude/skills/supabase-postgres-best-practices/references/schema-foreign-key-indexes.md`: Postgres does not automatically index foreign key columns. Missing indexes cause slow JOINs and CASCADE operations.
- `.claude/skills/supabase-postgres-best-practices/references/schema-lowercase-identifiers.md`: PostgreSQL folds unquoted identifiers to lowercase. Quoted mixed-case identifiers require quotes forever and cause issues with tools, ORMs, and AI assistants that may not recognize them.
- `.claude/skills/supabase-postgres-best-practices/references/schema-partitioning.md`: Partitioning splits a large table into smaller pieces, improving query performance and maintenance operations.
- `.claude/skills/supabase-postgres-best-practices/references/schema-primary-keys.md`: Primary key choice affects insert performance, index size, and replication efficiency.
- `.claude/skills/supabase-postgres-best-practices/references/security-privileges.md`: Grant only the minimum permissions required. Never use superuser for application queries.
- `.claude/skills/supabase-postgres-best-practices/references/security-rls-basics.md`: Row Level Security (RLS) enforces data access at the database level, ensuring users only see their own data.
- `.claude/skills/supabase-postgres-best-practices/references/security-rls-performance.md`: Poorly written RLS policies can cause severe performance issues. Use subqueries and indexes strategically.

## Tailwind CSS Development Patterns

Provides comprehensive Tailwind CSS utility-first styling patterns including responsive design, layout utilities, flexbox, grid, spacing, typography, colors, and modern CSS best practices. Use when styling React/Vue/Svelte components, building responsive layouts, implementing design systems, or o...

- `.claude/skills/tailwind-css-patterns/SKILL.md`
- `.claude/skills/tailwind-css-patterns/references/accessibility.md`
- `.claude/skills/tailwind-css-patterns/references/animations.md`: Usage:
- `.claude/skills/tailwind-css-patterns/references/component-patterns.md`
- `.claude/skills/tailwind-css-patterns/references/configuration.md`: Use the `@theme` directive for CSS-based configuration:
- `.claude/skills/tailwind-css-patterns/references/layout-patterns.md`: Basic flex container:
- `.claude/skills/tailwind-css-patterns/references/performance.md`: Configure content sources for optimal purging:
- `.claude/skills/tailwind-css-patterns/references/reference.md`: Tailwind CSS is a utility-first CSS framework that generates styles by scanning HTML, JavaScript, and template files for class names. It provides a comprehensive design system through CSS utility classes, enabling rapid UI development without writing custom CSS. The framework operates at build-ti...
- `.claude/skills/tailwind-css-patterns/references/responsive-design.md`: Enable dark mode in tailwind.config.js:

## Tailwind v4 + shadcn/ui Production Stack

|

- `.claude/skills/tailwind-v4-shadcn/SKILL.md`
- `.claude/skills/tailwind-v4-shadcn/references/advanced-usage.md`: **Purpose**: Advanced customization and component patterns for experienced Tailwind v4 + shadcn/ui developers **When to Load**: User asks for custom colors beyond defaults, advanced component patterns, composition best practices, or component customization
- `.claude/skills/tailwind-v4-shadcn/references/common-gotchas.md`: ❌ **WRONG:**
- `.claude/skills/tailwind-v4-shadcn/references/dark-mode.md`: Tailwind v4 + shadcn/ui dark mode requires: 1. `ThemeProvider` component to manage state 2. `.dark` class toggling on `<html>` element 3. localStorage persistence 4. System theme detection
- `.claude/skills/tailwind-v4-shadcn/references/migration-guide.md`: This guide helps you migrate from hardcoded Tailwind colors (`bg-blue-600`) to semantic CSS variables (`bg-primary`).
- `.claude/skills/tailwind-v4-shadcn/references/plugins-reference.md`: **Purpose**: Complete guide to Tailwind v4 official plugins (Typography, Forms) **When to Load**: User mentions prose class, Typography plugin, Forms plugin, @plugin directive, or plugin installation errors

## Three.js Animation

Three.js animation - keyframe animation, skeletal animation, morph targets, animation mixing. Use when animating objects, playing GLTF animations, creating procedural motion, or blending animations.

- `.claude/skills/threejs-animation/SKILL.md`

## Three.js Fundamentals

Three.js scene setup, cameras, renderer, Object3D hierarchy, coordinate systems. Use when setting up 3D scenes, creating cameras, configuring renderers, managing object hierarchies, or working with transforms.

- `.claude/skills/threejs-fundamentals/SKILL.md`

## Three.js Geometry

Three.js geometry creation - built-in shapes, BufferGeometry, custom geometry, instancing. Use when creating 3D shapes, working with vertices, building custom meshes, or optimizing with instanced rendering.

- `.claude/skills/threejs-geometry/SKILL.md`

## Three.js Interaction

Three.js interaction - raycasting, controls, mouse/touch input, object selection. Use when handling user input, implementing click detection, adding camera controls, or creating interactive 3D experiences.

- `.claude/skills/threejs-interaction/SKILL.md`

## Three.js Lighting

Three.js lighting - light types, shadows, environment lighting. Use when adding lights, configuring shadows, setting up IBL, or optimizing lighting performance.

- `.claude/skills/threejs-lighting/SKILL.md`

## Three.js Loaders

Three.js asset loading - GLTF, textures, images, models, async patterns. Use when loading 3D models, textures, HDR environments, or managing loading progress.

- `.claude/skills/threejs-loaders/SKILL.md`

## Three.js Materials

Three.js materials - PBR, basic, phong, shader materials, material properties. Use when styling meshes, working with textures, creating custom shaders, or optimizing material performance.

- `.claude/skills/threejs-materials/SKILL.md`

## Three.js Post-Processing

Three.js post-processing - EffectComposer, bloom, DOF, screen effects. Use when adding visual effects, color grading, blur, glow, or creating custom screen-space shaders.

- `.claude/skills/threejs-postprocessing/SKILL.md`

## Three.js Shaders

Three.js shaders - GLSL, ShaderMaterial, uniforms, custom effects. Use when creating custom visual effects, modifying vertices, writing fragment shaders, or extending built-in materials.

- `.claude/skills/threejs-shaders/SKILL.md`

## Three.js Textures

Three.js textures - texture types, UV mapping, environment maps, texture settings. Use when working with images, UV coordinates, cubemaps, HDR environments, or texture optimization.

- `.claude/skills/threejs-textures/SKILL.md`

## TypeScript Advanced Types

Master TypeScript's advanced type system including generics, conditional types, mapped types, template literals, and utility types for building type-safe applications. Use when implementing complex type logic, creating reusable type utilities, or ensuring compile-time type safety in TypeScript pr...

- `.claude/skills/typescript-advanced-types/SKILL.md`

## Upgrading Stripe Versions

Guide for upgrading Stripe API versions and SDKs

- `.claude/skills/upgrade-stripe/SKILL.md`

## React Composition Patterns

Composition patterns for building flexible, maintainable React components. Avoid boolean prop proliferation by using compound components, lifting state, and composing internals. These patterns make codebases easier for both humans and AI agents to work with as they scale.

- `.claude/skills/vercel-composition-patterns/SKILL.md`
- `.claude/skills/vercel-composition-patterns/AGENTS.md`: **Version 1.0.0** Engineering January 2026
- `.claude/skills/vercel-composition-patterns/README.md`: A structured repository for React composition patterns that scale. These patterns help avoid boolean prop proliferation by using compound components, lifting state, and composing internals.
- `.claude/skills/vercel-composition-patterns/rules/_sections.md`: This file defines all sections, their ordering, impact levels, and descriptions. The section ID (in parentheses) is the filename prefix used to group rules.
- `.claude/skills/vercel-composition-patterns/rules/_template.md`: Brief explanation of the rule and why it matters.
- `.claude/skills/vercel-composition-patterns/rules/architecture-avoid-boolean-props.md`: Don't add boolean props like `isThread`, `isEditing`, `isDMThread` to customize component behavior. Each boolean doubles possible states and creates unmaintainable conditional logic. Use composition instead.
- `.claude/skills/vercel-composition-patterns/rules/architecture-compound-components.md`: Structure complex components as compound components with a shared context. Each subcomponent accesses shared state via context, not props. Consumers compose the pieces they need.
- `.claude/skills/vercel-composition-patterns/rules/patterns-children-over-render-props.md`: Use `children` for composition instead of `renderX` props. Children are more readable, compose naturally, and don't require understanding callback signatures.
- `.claude/skills/vercel-composition-patterns/rules/patterns-explicit-variants.md`: Instead of one component with many boolean props, create explicit variant components. Each variant composes the pieces it needs. The code documents itself.
- `.claude/skills/vercel-composition-patterns/rules/react19-no-forwardref.md`: In React 19, `ref` is now a regular prop (no `forwardRef` wrapper needed), and `use()` replaces `useContext()`.
- `.claude/skills/vercel-composition-patterns/rules/state-context-interface.md`: Define a **generic interface** for your component context with three parts: can implement—enabling the same UI components to work with completely different state implementations.
- `.claude/skills/vercel-composition-patterns/rules/state-decouple-implementation.md`: The provider component should be the only place that knows how state is managed. UI components consume the context interface—they don't know if state comes from useState, Zustand, or a server sync.
- `.claude/skills/vercel-composition-patterns/rules/state-lift-state.md`: Move state management into dedicated provider components. This allows sibling components outside the main UI to access and modify state without prop drilling or awkward refs.

## Vercel React Best Practices

React and Next.js performance optimization guidelines from Vercel Engineering. This skill should be used when writing, reviewing, or refactoring React/Next.js code to ensure optimal performance patterns. Triggers on tasks involving React components, Next.js pages, data fetching, bundle optimizati...

- `.claude/skills/vercel-react-best-practices/SKILL.md`
- `.claude/skills/vercel-react-best-practices/AGENTS.md`: **Version 1.0.0** Vercel Engineering January 2026
- `.claude/skills/vercel-react-best-practices/README.md`: A structured repository for creating and maintaining React Best Practices optimized for agents and LLMs.
- `.claude/skills/vercel-react-best-practices/rules/_sections.md`: This file defines all sections, their ordering, impact levels, and descriptions. The section ID (in parentheses) is the filename prefix used to group rules.
- `.claude/skills/vercel-react-best-practices/rules/_template.md`: **Impact: MEDIUM (optional impact description)**
- `.claude/skills/vercel-react-best-practices/rules/advanced-effect-event-deps.md`: Effect Event functions do not have a stable identity. Their identity intentionally changes on every render. Do not include the function returned by `useEffectEvent` in a `useEffect` dependency array. Keep the actual reactive values as dependencies and call the Effect Event from inside the effect...
- `.claude/skills/vercel-react-best-practices/rules/advanced-event-handler-refs.md`: Store callbacks in refs when used in effects that shouldn't re-subscribe on callback changes.
- `.claude/skills/vercel-react-best-practices/rules/advanced-init-once.md`: Do not put app-wide initialization that must run once per app load inside `useEffect([])` of a component. Components can remount and effects will re-run. Use a module-level guard or top-level init in the entry module instead.
- `.claude/skills/vercel-react-best-practices/rules/advanced-use-latest.md`: Access latest values in callbacks without adding them to dependency arrays. Prevents effect re-runs while avoiding stale closures.
- `.claude/skills/vercel-react-best-practices/rules/async-api-routes.md`: In API routes and Server Actions, start independent operations immediately, even if you don't await them yet.
- `.claude/skills/vercel-react-best-practices/rules/async-cheap-condition-before-await.md`: When a branch uses `await` for a flag or remote value and also requires a **cheap synchronous** condition (local props, request metadata, already-loaded state), evaluate the cheap condition **first**. Otherwise you pay for the async call even when the compound condition can never be true.
- `.claude/skills/vercel-react-best-practices/rules/async-defer-await.md`: Move `await` operations into the branches where they're actually used to avoid blocking code paths that don't need them.
- `.claude/skills/vercel-react-best-practices/rules/async-dependencies.md`: For operations with partial dependencies, use `better-all` to maximize parallelism. It automatically starts each task at the earliest possible moment.
- `.claude/skills/vercel-react-best-practices/rules/async-parallel.md`: When async operations have no interdependencies, execute them concurrently using `Promise.all()`.
- `.claude/skills/vercel-react-best-practices/rules/async-suspense-boundaries.md`: Instead of awaiting data in async components before returning JSX, use Suspense boundaries to show the wrapper UI faster while data loads.
- `.claude/skills/vercel-react-best-practices/rules/bundle-barrel-imports.md`: Import directly from source files instead of barrel files to avoid loading thousands of unused modules. **Barrel files** are entry points that re-export multiple modules (e.g., `index.js` that does `export * from './module'`).
- `.claude/skills/vercel-react-best-practices/rules/bundle-conditional.md`: Load large data or modules only when a feature is activated.
- `.claude/skills/vercel-react-best-practices/rules/bundle-defer-third-party.md`: Analytics, logging, and error tracking don't block user interaction. Load them after hydration.
- `.claude/skills/vercel-react-best-practices/rules/bundle-dynamic-imports.md`: Use `next/dynamic` to lazy-load large components not needed on initial render.
- `.claude/skills/vercel-react-best-practices/rules/bundle-preload.md`: Preload heavy bundles before they're needed to reduce perceived latency.
- `.claude/skills/vercel-react-best-practices/rules/client-event-listeners.md`: Use `useSWRSubscription()` to share global event listeners across component instances.
- `.claude/skills/vercel-react-best-practices/rules/client-localstorage-schema.md`: Add version prefix to keys and store only needed fields. Prevents schema conflicts and accidental storage of sensitive data.
- `.claude/skills/vercel-react-best-practices/rules/client-passive-event-listeners.md`: Add `{ passive: true }` to touch and wheel event listeners to enable immediate scrolling. Browsers normally wait for listeners to finish to check if `preventDefault()` is called, causing scroll delay.
- `.claude/skills/vercel-react-best-practices/rules/client-swr-dedup.md`: SWR enables request deduplication, caching, and revalidation across component instances.
- `.claude/skills/vercel-react-best-practices/rules/js-batch-dom-css.md`: Avoid interleaving style writes with layout reads. When you read a layout property (like `offsetWidth`, `getBoundingClientRect()`, or `getComputedStyle()`) between style changes, the browser is forced to trigger a synchronous reflow.
- `.claude/skills/vercel-react-best-practices/rules/js-cache-function-results.md`: Use a module-level Map to cache function results when the same function is called repeatedly with the same inputs during render.
- `.claude/skills/vercel-react-best-practices/rules/js-cache-property-access.md`: Cache object property lookups in hot paths.
- `.claude/skills/vercel-react-best-practices/rules/js-cache-storage.md`: **Incorrect (reads storage on every call):**
- `.claude/skills/vercel-react-best-practices/rules/js-combine-iterations.md`: Multiple `.filter()` or `.map()` calls iterate the array multiple times. Combine into one loop.
- `.claude/skills/vercel-react-best-practices/rules/js-early-exit.md`: Return early when result is determined to skip unnecessary processing.
- `.claude/skills/vercel-react-best-practices/rules/js-flatmap-filter.md`: **Impact: LOW-MEDIUM (eliminates intermediate array)**
- `.claude/skills/vercel-react-best-practices/rules/js-hoist-regexp.md`: Don't create RegExp inside render. Hoist to module scope or memoize with `useMemo()`.
- `.claude/skills/vercel-react-best-practices/rules/js-index-maps.md`: Multiple `.find()` calls by the same key should use a Map.
- `.claude/skills/vercel-react-best-practices/rules/js-length-check-first.md`: When comparing arrays with expensive operations (sorting, deep equality, serialization), check lengths first. If lengths differ, the arrays cannot be equal.
- `.claude/skills/vercel-react-best-practices/rules/js-min-max-loop.md`: Finding the smallest or largest element only requires a single pass through the array. Sorting is wasteful and slower.
- `.claude/skills/vercel-react-best-practices/rules/js-request-idle-callback.md`: **Impact: MEDIUM (keeps UI responsive during background tasks)**
- `.claude/skills/vercel-react-best-practices/rules/js-set-map-lookups.md`: Convert arrays to Set/Map for repeated membership checks.
- `.claude/skills/vercel-react-best-practices/rules/js-tosorted-immutable.md`: **Incorrect (mutates original array):**
- `.claude/skills/vercel-react-best-practices/rules/rendering-activity.md`: Use React's `<Activity>` to preserve state/DOM for expensive components that frequently toggle visibility.
- `.claude/skills/vercel-react-best-practices/rules/rendering-animate-svg-wrapper.md`: Many browsers don't have hardware acceleration for CSS3 animations on SVG elements. Wrap SVG in a `<div>` and animate the wrapper instead.
- `.claude/skills/vercel-react-best-practices/rules/rendering-conditional-render.md`: Use explicit ternary operators (`? :`) instead of `&&` for conditional rendering when the condition can be `0`, `NaN`, or other falsy values that render.
- `.claude/skills/vercel-react-best-practices/rules/rendering-content-visibility.md`: Apply `content-visibility: auto` to defer off-screen rendering.
- `.claude/skills/vercel-react-best-practices/rules/rendering-hoist-jsx.md`: Extract static JSX outside components to avoid re-creation.
- `.claude/skills/vercel-react-best-practices/rules/rendering-hydration-no-flicker.md`: When rendering content that depends on client-side storage (localStorage, cookies), avoid both SSR breakage and post-hydration flickering by injecting a synchronous script that updates the DOM before React hydrates.
- `.claude/skills/vercel-react-best-practices/rules/rendering-hydration-suppress-warning.md`: In SSR frameworks (e.g., Next.js), some values are intentionally different on server vs client (random IDs, dates, locale/timezone formatting). For these *expected* mismatches, wrap the dynamic text in an element with `suppressHydrationWarning` to prevent noisy warnings. Do not use this to hide r...
- `.claude/skills/vercel-react-best-practices/rules/rendering-resource-hints.md`: **Impact: HIGH (reduces load time for critical resources)**
- `.claude/skills/vercel-react-best-practices/rules/rendering-script-defer-async.md`: **Impact: HIGH (eliminates render-blocking)**
- `.claude/skills/vercel-react-best-practices/rules/rendering-svg-precision.md`: Reduce SVG coordinate precision to decrease file size. The optimal precision depends on the viewBox size, but in general reducing precision should be considered.
- `.claude/skills/vercel-react-best-practices/rules/rendering-usetransition-loading.md`: Use `useTransition` instead of manual `useState` for loading states. This provides built-in `isPending` state and automatically manages transitions.
- `.claude/skills/vercel-react-best-practices/rules/rerender-defer-reads.md`: Don't subscribe to dynamic state (searchParams, localStorage) if you only read it inside callbacks.
- `.claude/skills/vercel-react-best-practices/rules/rerender-dependencies.md`: Specify primitive dependencies instead of objects to minimize effect re-runs.
- `.claude/skills/vercel-react-best-practices/rules/rerender-derived-state-no-effect.md`: If a value can be computed from current props/state, do not store it in state or update it in an effect. Derive it during render to avoid extra renders and state drift. Do not set state in effects solely in response to prop changes; prefer derived values or keyed resets instead.
- `.claude/skills/vercel-react-best-practices/rules/rerender-derived-state.md`: Subscribe to derived boolean state instead of continuous values to reduce re-render frequency.
- `.claude/skills/vercel-react-best-practices/rules/rerender-functional-setstate.md`: When updating state based on the current state value, use the functional update form of setState instead of directly referencing the state variable. This prevents stale closures, eliminates unnecessary dependencies, and creates stable callback references.
- `.claude/skills/vercel-react-best-practices/rules/rerender-lazy-state-init.md`: Pass a function to `useState` for expensive initial values. Without the function form, the initializer runs on every render even though the value is only used once.
- `.claude/skills/vercel-react-best-practices/rules/rerender-memo-with-default-value.md`: When memoized component has a default value for some non-primitive optional parameter, such as an array, function, or object, calling the component without that parameter results in broken memoization. This is because new value instances are created on every rerender, and they do not pass strict...
- `.claude/skills/vercel-react-best-practices/rules/rerender-memo.md`: Extract expensive work into memoized components to enable early returns before computation.
- `.claude/skills/vercel-react-best-practices/rules/rerender-move-effect-to-event.md`: If a side effect is triggered by a specific user action (submit, click, drag), run it in that event handler. Do not model the action as state + effect; it makes effects re-run on unrelated changes and can duplicate the action.
- `.claude/skills/vercel-react-best-practices/rules/rerender-no-inline-components.md`: **Impact: HIGH (prevents remount on every render)**
- `.claude/skills/vercel-react-best-practices/rules/rerender-simple-expression-in-memo.md`: When an expression is simple (few logical or arithmetical operators) and has a primitive result type (boolean, number, string), do not wrap it in `useMemo`. Calling `useMemo` and comparing hook dependencies may consume more resources than the expression itself.
- `.claude/skills/vercel-react-best-practices/rules/rerender-split-combined-hooks.md`: When a hook contains multiple independent tasks with different dependencies, split them into separate hooks. A combined hook reruns all tasks when any dependency changes, even if some tasks don't use the changed value.
- `.claude/skills/vercel-react-best-practices/rules/rerender-transitions.md`: Mark frequent, non-urgent state updates as transitions to maintain UI responsiveness.
- `.claude/skills/vercel-react-best-practices/rules/rerender-use-deferred-value.md`: When user input triggers expensive computations or renders, use `useDeferredValue` to keep the input responsive. The deferred value lags behind, allowing React to prioritize the input update and render the expensive result when idle.
- `.claude/skills/vercel-react-best-practices/rules/rerender-use-ref-transient-values.md`: When a value changes frequently and you don't want a re-render on every update (e.g., mouse trackers, intervals, transient flags), store it in `useRef` instead of `useState`. Keep component state for UI; use refs for temporary DOM-adjacent values. Updating a ref does not trigger a re-render.
- `.claude/skills/vercel-react-best-practices/rules/server-after-nonblocking.md`: Use Next.js's `after()` to schedule work that should execute after a response is sent. This prevents logging, analytics, and other side effects from blocking the response.
- `.claude/skills/vercel-react-best-practices/rules/server-auth-actions.md`: **Impact: CRITICAL (prevents unauthorized access to server mutations)**
- `.claude/skills/vercel-react-best-practices/rules/server-cache-lru.md`: **Implementation:**
- `.claude/skills/vercel-react-best-practices/rules/server-cache-react.md`: Use `React.cache()` for server-side request deduplication. Authentication and database queries benefit most.
- `.claude/skills/vercel-react-best-practices/rules/server-dedup-props.md`: **Impact: LOW (reduces network payload by avoiding duplicate serialization)**
- `.claude/skills/vercel-react-best-practices/rules/server-hoist-static-io.md`: **Impact: HIGH (avoids repeated file/network I/O per request)**
- `.claude/skills/vercel-react-best-practices/rules/server-no-shared-module-state.md`: For React Server Components and client components rendered during SSR, avoid using mutable module-level variables to share request-scoped data. Server renders can run concurrently in the same process. If one render writes to shared module state and another render reads it, you can get race condit...
- `.claude/skills/vercel-react-best-practices/rules/server-parallel-fetching.md`: React Server Components execute sequentially within a tree. Restructure with composition to parallelize data fetching.
- `.claude/skills/vercel-react-best-practices/rules/server-parallel-nested-fetching.md`: When fetching nested data in parallel, chain dependent fetches within each item's promise so a slow item doesn't block the rest.
- `.claude/skills/vercel-react-best-practices/rules/server-serialization.md`: The React Server/Client boundary serializes all object properties into strings and embeds them in the HTML response and subsequent RSC requests. This serialized data directly impacts page weight and load time, so **size matters a lot**. Only pass fields that the client actually uses.

<!-- autoskills:end -->
