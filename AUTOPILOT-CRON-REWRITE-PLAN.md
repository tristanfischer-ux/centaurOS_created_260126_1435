# Autopilot cron-based orchestrator — rewrite plan

## Why

Current setup has five competing orchestrators. Each one uses `after()` callbacks and/or fire-and-forget fetches. Each one has its own failure modes, race conditions, and self-heal branches:

1. Autopilot state machine — HTTP hops between stages via `after(fetch)` and now inline-await+abort
2. Max's after-chain — fires sizing + BOM directly, bypassing autopilot's state
3. BOM's internal after-chain — skeleton → batch → merge → Finn cost
4. Render chain — per-module HTTP hops, same pattern as autopilot
5. Workspace-page tick — re-fires stuck stages on page render

Every fresh run surfaces a new failure mode in the interaction between these. Runs 1–12 each landed a different fix; run 12 showed `await fetch` with `keepalive: true` silently resolving before the POST actually flushed.

## What

Replace all the above with **one deterministic tick loop** driven by a Vercel cron.

### Stage runner contract

Each stage is a pure async function:
```ts
async function runStage<S extends AutopilotStage>(
  projectId: string,
  stage: S
): Promise<{ advanced: AutopilotStage | null; error?: string }>
```

Runs to completion. Writes pipeline_runs. Writes stage-specific columns (dimension_sheet, spatial_plan, etc.). Returns next stage or `null` on terminal. Never schedules anything. Never calls `after()`.

### Cron tick

`/api/autopilot-tick` — invoked every 30 seconds by Vercel cron.

```ts
export async function GET() {
  // 1. Find projects with autopilot running and not advanced in > 10s
  const projects = await admin.rpc("claim_next_autopilot_project")
  // (atomic: sets `autopilot_state.locked_at = now()` and
  //  returns the project id if previous lock was > 120s ago)
  for (const p of projects) {
    try {
      const result = await runStage(p.id, p.stage)
      if (result.advanced) {
        await admin.update(...).set({ autopilot_state.stage = result.advanced })
      }
    } catch (err) {
      await admin.update(...).set({ autopilot_state.last_error = err.message })
    }
  }
}
```

**Parallelism:** cron is single-threaded per invocation. If 10 projects need tick, cron processes them serially within a 300s budget. Fine for small tenant counts. For scale, shard by project-id mod N across multiple cron paths.

**Advance latency:** up to 30s between stages. Stages already take 30–300s each. Total end-to-end: same as today (~8–12 min for BESS).

### What gets deleted

- `scheduleAutopilotStep` (inline-await hop) — gone
- `scheduleNextStageViaHttp` (render chain hop) — gone
- All `after(() => runXxxBackground())` in Max, BOM, run-finn-cost etc. — gone
- `/api/autopilot-step` route handler — gone (or repurposed)
- `/api/render-stage` route handler — gone
- `tickAutopilotStage` on workspace page render — gone (cron subsumes it)

### What stays

- All the stage runners themselves (runFangSizingBackground, runMaxDecompositionBackground, etc.) — unchanged, just called differently
- pipeline_runs schema — unchanged
- autopilot_state column shape — unchanged (plus `locked_at` for cron claim)
- 23505 idempotency handler in startPipelineRun — still useful for concurrent tick + manual retry

## Migration

1. Add migration: `autopilot_state.locked_at` column + RPC `claim_next_autopilot_project()`
2. Write `/api/autopilot-tick` route
3. Add Vercel cron entry in `vercel.json` (or `vercel.ts`) — `{ path: "/api/autopilot-tick", schedule: "*/30 * * * * *" }` (every 30s)
4. Convert each `stepXxx` in forge-v2-autopilot.ts to return `{ advanced, error }` — no side-effect schedule calls
5. Delete the legacy Max/BOM after-chains
6. Delete the HTTP-hop routes
7. Feature-flag rollout: new cron gated behind `autopilot_cron_enabled` flag; old hop path stays as fallback during migration

## Test plan

1. Turn cron on in preview
2. Run verify-autopilot.sh — expect end-to-end PDF within ~12 min
3. Run verify-autopilot.sh with 3 parallel projects — expect all three complete
4. Run verify-autopilot.sh with one project that deliberately throws in runFangSizing — expect stage_machine pauses at `failed_stages: [waiting_sizing]`, error logged in autopilot_state.last_error
5. Kill dev server mid-stage, restart — expect next cron tick picks up and continues

## Rollback

Flip `autopilot_cron_enabled` off → reverts to the HTTP-hop path. Old code stays for one release cycle.

## Cost

- Vercel cron @ 30s = 2 invocations/min = ~86,400/month. Hobby plan limit is 2 cron jobs, Pro is unlimited on per-second schedule (minimum 1 min on Hobby, any interval on Pro — we're on Pro).
- Per-invocation: one SQL query + any staged work. Most invocations are no-ops (no projects running) and exit in <1s.
- Expected: negligible cost bump, probably <$5/month added over current.

## Effort

~1 day end-to-end:
- 2h: migration + RPC
- 2h: /api/autopilot-tick route + stage-runner refactor
- 2h: delete legacy chains
- 1h: feature flag + vercel.ts update
- 1h: verify-autopilot still passes
