/**
 * @file stage-config.ts — declarative stage map for the zero-wait autopilot
 *
 * @description Single source of truth for the autopilot stage machine.
 * Used by the cron orchestrator (`/api/cron/autopilot-tick`) and the fire
 * endpoint (`/api/autopilot-step`). Lives in `src/lib/` so both server and
 * client modules can import it (autopilot.ts is `"use server"` and forbids
 * non-async exports — see memory `forgeos_use_server_non_async_exports.md`).
 *
 * The cron tick is the ONLY orchestrator. For each active project:
 *   1. Read autopilot_state.stage
 *   2. Look up STAGE_CONFIG[stage]
 *   3. Check pipeline_runs for (project, 'autopilot', stage)
 *   4. If status='done' → advance to nextStage
 *   5. If status='running' & age<5min → skip
 *   6. If status='running' & age>=5min → mark stale, refire
 *   7. If status='failed' → terminal-fail (or retry if attempts<maxAttempts)
 *   8. If no row → fire via /api/autopilot-step (await fetch with 2s abort)
 *
 * The fire endpoint INSERTs the (project, 'autopilot', stage, 'running')
 * row on entry, calls the underlying specialist Background fn synchronously
 * in its own 300s container, then UPDATEs the row to 'done' or 'failed'.
 *
 * No polling. No after() cascades. No HTTP-hop chains.
 */

import type {
    AutopilotStage,
    AutopilotStepName,
} from "@/actions/forge-v2-autopilot"

// Re-export so consumers of stage-config can grab the step-name type without
// pulling in autopilot.ts directly.
export type { AutopilotStepName }

/** Pseudo-specialist namespace used for the autopilot's own tracking rows.
 *  Distinguishes orchestrator state from specialists' own pipeline_runs
 *  rows (vp-supply-chain, cto, vp-manufacturing, finance-lead). */
export const AUTOPILOT_TRACKING_SPECIALIST = "autopilot" as const

/** A stage that runs synchronously inside the cron tick (no specialist
 *  call, no /api/autopilot-step round-trip). Currently only locking_brief —
 *  it does small DB writes (<1s) and immediately advances. */
export type SynchronousStageConfig = {
    kind: "synchronous"
    /** The next stage to advance to on success. */
    nextStage: AutopilotStage
    /** How many retries before terminal-failing. */
    maxAttempts: number
}

/** A stage that fires a specialist via the fire endpoint and waits for the
 *  autopilot tracking row to land 'done'. The fire endpoint runs the
 *  specialist's Background fn in its own 300s container. */
export type FireStageConfig = {
    kind: "fire"
    /** Step name posted to /api/autopilot-step. */
    fireStep: AutopilotStepName
    /** The next stage to advance to on success. 'done' is terminal. */
    nextStage: AutopilotStage | "done"
    /** How many retries before terminal-failing. */
    maxAttempts: number
    /**
     * L9-FANG-STALE (2026-04-27): per-stage override for the cron's
     * stale-tracking-row threshold. The default `STALE_RUNNING_MS` is
     * tuned for single-call stages (~3-9 min). Fanout stages —
     * specifically `running_fang_reviews` with parallelism cap 2 across
     * 8 modules — take 12-24 min wall-clock when the fanout is honest.
     *
     * When omitted, falls back to the global `STALE_RUNNING_MS`.
     *
     * Without this override, the cron marks the autopilot tracker
     * STALE_ABANDONED at 9 min mid-fanout, refires
     * `runFangReviewsForAllModules`, and burns Sonnet credits on the
     * still-running modules. Verified on Hedgerow 2026-04-27 — 5
     * sequential retries × ~£0.10 each = ~£0.50 wasted per project per
     * regen, on top of the legitimate fanout cost.
     */
    staleMsOverride?: number
}

export type StageConfig = SynchronousStageConfig | FireStageConfig

/** Declarative state machine. The cron tick reads this; nothing else
 *  should hold a copy of stage→step or stage→nextStage knowledge. */
export const STAGE_CONFIG: Record<
    Exclude<AutopilotStage, "done" | "failed" | "solver_error" | "preflight_blocked" | "gate_1_blocked">,
    StageConfig
> = {
    waiting_chase: {
        kind: "fire",
        fireStep: "waitForChase",
        nextStage: "locking_brief",
        maxAttempts: 3,
    },
    locking_brief: {
        kind: "synchronous",
        nextStage: "waiting_max",
        maxAttempts: 3,
    },
    waiting_max: {
        kind: "fire",
        fireStep: "waitForMax",
        nextStage: "waiting_sizing",
        maxAttempts: 3,
    },
    waiting_max_redecomposition: {
        // v1.8 (2026-04-29 Gates Council R1 P1): Max re-fired after Fang sizing
        // detected a topology-level overflow. The cron fires waitForMaxRedecomposition
        // which calls runMaxDecompositionBackground with the gate_remediation_context
        // already stashed at waiting_max by triggerRemediation. On success the
        // pipeline continues from waiting_sizing exactly as a first-pass would.
        kind: "fire",
        fireStep: "waitForMaxRedecomposition",
        nextStage: "waiting_sizing",
        // Allow 2 redecomposition attempts — if Max still can't produce a feasible
        // topology on the second try, terminal-fail and let the founder revise the brief.
        maxAttempts: 2,
    },
    waiting_sizing: {
        kind: "fire",
        fireStep: "waitForSizing",
        nextStage: "waiting_layout",
        maxAttempts: 3,
    },
    waiting_layout: {
        kind: "fire",
        fireStep: "waitForLayout",
        nextStage: "waiting_bom",
        maxAttempts: 3,
    },
    waiting_bom: {
        kind: "fire",
        fireStep: "waitForBom",
        nextStage: "waiting_finn",
        // BOM is a 3-stage internal chain (generator → skeleton → batches
        // → merge). Skeleton fires the rest via after() with inherent
        // flakiness. Budget 6 retries (~6 min) for the chain to settle.
        maxAttempts: 6,
    },
    waiting_finn: {
        kind: "fire",
        fireStep: "waitForFinn",
        nextStage: "matching_suppliers",
        // Finn precondition is `parts` table populated by BOM merge stage.
        // Merge runs via after() chain after BOM autopilot row is already
        // marked done — Finn will see "Generate a BOM first" until merge
        // lands. Budget 5 retries (~5 min) to absorb that lag.
        maxAttempts: 5,
    },
    matching_suppliers: {
        kind: "fire",
        fireStep: "matchSuppliers",
        nextStage: "running_fang_reviews",
        maxAttempts: 2,
    },
    running_fang_reviews: {
        kind: "fire",
        fireStep: "runFangReviews",
        nextStage: "proofreading",
        // Per-module fan-out: each module review takes ~60s × N modules.
        // First 2 retries give the partial-success path room to backfill
        // failed modules; further retries cover transient Anthropic 429s.
        maxAttempts: 5,
        // L9-FANG-STALE: 8 modules @ parallelism 2 × 3 min/module = 12 min
        // wall-clock minimum. 9-min default triggered STALE_ABANDONED
        // mid-fanout on every Hedgerow run, refired runFangReviewsForAllModules
        // 5 times, burned Sonnet credits on still-running modules. Bump to
        // 25 min to give honest fanouts headroom; the cron still detects
        // genuinely-dead trackers, just later.
        staleMsOverride: 25 * 60 * 1000,
    },
    proofreading: {
        kind: "fire",
        fireStep: "runProofreader",
        nextStage: "generating_illustration",
        // Single V4-Pro fact-check call; transient OpenRouter 429/5xx
        // covered by 3 retries.
        maxAttempts: 3,
    },
    generating_illustration: {
        kind: "fire",
        fireStep: "generateIllustration",
        nextStage: "generating_pdf",
        maxAttempts: 2,
    },
    generating_pdf: {
        kind: "fire",
        fireStep: "generatePdf",
        nextStage: "done",
        // PDF gen has @react-pdf/renderer + brief render-readiness wait;
        // 5 retries absorbs transient Vercel cold-starts and image queue
        // settle time.
        maxAttempts: 5,
    },
}

/** Reverse lookup: step name → originating autopilot stage. The fire
 *  endpoint uses this to write its tracking row under the right stage. */
export const STEP_TO_STAGE: Record<AutopilotStepName, AutopilotStage> = {
    waitForChase: "waiting_chase",
    waitForMax: "waiting_max",
    waitForSizing: "waiting_sizing",
    waitForMaxRedecomposition: "waiting_max_redecomposition",
    waitForLayout: "waiting_layout",
    waitForBom: "waiting_bom",
    waitForFinn: "waiting_finn",
    generateIllustration: "generating_illustration",
    matchSuppliers: "matching_suppliers",
    runFangReviews: "running_fang_reviews",
    runProofreader: "proofreading",
    generatePdf: "generating_pdf",
}

/** Set of valid step names for runtime validation in the fire endpoint. */
export const VALID_STEPS = new Set<string>(Object.keys(STEP_TO_STAGE))

export function isAutopilotStepName(s: string): s is AutopilotStepName {
    return VALID_STEPS.has(s)
}

/** A 'running' tracking row older than this is treated as orphaned —
 *  most likely a Vercel container that got SIGKILLed mid-call. The cron
 *  marks it failed (STALE_ABANDONED) and refires next tick.
 *
 *  Loop 8 (2026-04-26): Fang fanout with CONCURRENCY=2 across 9 modules
 *  takes 4-7 min wall-clock. The 5-min threshold was triggering
 *  fire_after_stale while the lambda was still legitimately running,
 *  causing duplicate fang lambdas to overlap on the same project (per
 *  memory `forgeos_dual_trigger_race_creates_duplicate_side_effects`).
 *  Bump to 9 min so a full 9-module fang fanout has headroom.
 */
export const STALE_RUNNING_MS = 9 * 60 * 1000

/** Time the cron's fire-fetch waits before aborting. The receiving
 *  Lambda continues running for its full 300s budget after the abort —
 *  Vercel does not tie Lambda lifetime to client connection. */
export const FIRE_TIMEOUT_MS = 2_000

/** Cap on projects processed per cron tick. With 6 demos this is never
 *  hit; protects against runaway tenant. */
export const MAX_PROJECTS_PER_TICK = 10
