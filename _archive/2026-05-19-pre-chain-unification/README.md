# Pre-chain-unification archive (2026-05-19)

## Why this directory exists

Tristan's directive (2026-05-19, verbatim):

> "I want one core engine which just works, and I want you to stop having the
> other engines working and stop having the other engines exist. All those
> other engines need to somehow be put away in a place which you can't get
> access to and don't copy by mistake. I don't mind it as a reference in
> case we need it, and I don't necessarily want to delete it just yet until
> we've proven that the core engine works."

The audit on 2026-05-19 (drawer `forgeos_decisions_d43cbc3af134f902`) discovered
that FOUR parallel pipelines existed in the repo:

1. **Chain engine** — `scripts/serial-design-chain-v2.tsx` + Mac Studio worker
   (`scripts/pdf-engine-worker.mjs`, polls `pdf_engine_runs`). THIS IS THE
   CANONICAL ENGINE.
2. **Autopilot specialists** — `src/actions/forge-v2-autopilot.ts` state
   machine + 12 specialist server actions + `export-project-pdf.tsx`.
   RETIRED 2026-05-19.
3. **PA pipeline** — `src/lib/pdf-engine-v2/index.ts` + `stages/N-*.ts`.
   Mostly dead — chain imports a couple of stage helpers but the
   `runPipeline` orchestrator is unreferenced. RETIRED 2026-05-19.
4. **PDF v3** — `src/lib/pdf-v3/`. Dormant. RETIRED 2026-05-19.

Weeks of K10 + Engine A + compliance-gate engineering had landed in #3 and
never reached production PDFs because nobody had bridged it into #1.

## What lives in this directory

Reference copies of retired files, preserved verbatim. Do not import from
this directory. If you need to bring something back into production, copy
it into `scripts/serial-design-chain-v2.tsx` (or an adjacent script) and
delete this archived copy.

## What is currently retired

Phase A (done 2026-05-19) — **STOP autopilot RUNNING** without breaking
the build. Three surgical edits:

| File | What changed |
|---|---|
| `src/actions/start-project-with-autopilot.ts` | `/start` now INSERTs into `pdf_engine_runs` instead of calling `startAutopilot()`. |
| `src/actions/cad-lab-projects.ts` (~line 500) | Chase auto-fire on project creation disabled. |
| `src/app/api/cron/autopilot-tick/route.ts` | Cron handler returns no-op JSON. |
| `src/app/api/autopilot-step/route.ts` | Rewritten as a 410 Gone stub; original ~1700-line implementation copied to `api/autopilot-step-route.ts.archived`. |

Phase B (NEXT, needs Tristan approval) — **physical archive of dead files**:

- `src/actions/forge-v2-autopilot.ts` (30KB state machine)
- `src/actions/specialists/run-chase-research*.ts`
- `src/actions/specialists/run-fang-*.ts`
- `src/actions/specialists/run-finn-cost.ts`
- `src/actions/specialists/run-max-decomposition.ts`
- `src/actions/specialists/run-proofreader.ts`
- `src/actions/brief-lock.ts`
- `src/actions/forge-v2-generate-concept-render.ts`
- `src/actions/forge-v2-render-all-modules.ts`
- `src/actions/export-project-pdf.tsx` (old React-PDF renderer)
- `src/actions/forge-v2-supplier-discovery.ts`
- `src/actions/forge-v2-supplier-match.ts`
- `src/lib/forge-v2/stage-config.ts`
- `src/lib/forge-v2/preflight-oracle.ts`
- `src/lib/forge-v2/stage-scoring.ts`
- `src/lib/forge-v2/cross-modal-consistency.ts`
- `src/lib/forge-v2/stage-gates/*`
- `src/lib/forge-v2/fix-router.ts`
- `src/lib/forge-narrative/stage-narratives.ts`
- `src/lib/per-stage-loop/adapters/chase-regulatory.ts`
- `src/lib/pdf-engine-v2/index.ts` (PA orchestrator)
- Most `src/lib/pdf-engine-v2/stages/*.ts` (EXCEPT `0-brief-generation.ts`
  and `1-research.ts` which the chain imports)
- `src/lib/pdf-v3/` (entire tree)

**Why not yet?** 30+ files under `src/app/(platform)/the-forge-v2/*`
import from these. Moving them in one shot breaks the entire workspace UI
tree. Phase B needs to either:
(a) rewire the workspace UI to poll `pdf_engine_runs` and stop importing
    autopilot-state types, OR
(b) accept the website being broken (Tristan: "Don't worry about the
    website at the moment") and proceed with the moves anyway.

Default to (a) when Tristan is online to confirm scope.

## How to bypass this archive

You shouldn't. The pre-commit drift gate (`scripts/pre-commit-drift-gate.sh`)
exists to stop new work from landing in dead code paths. If you must:

```bash
git commit --no-verify
```

That bypasses the gate AND announces the drift in the commit log.
