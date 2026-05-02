/**
 * @file registry.ts — Quality Gates v2.0 stage→gate mapping
 *
 * @description Maps each AutopilotStage to the GateRunner that evaluates
 * quality AFTER that stage completes and BEFORE the pipeline advances.
 *
 * ## How to register a gate (Phase 2 sub-agents)
 *
 * 1. Create `src/lib/forge-v2/stage-gates/gate-N.ts`
 * 2. Export a const satisfying `DeterministicGate<T>` | `LLMVoteGate<T>` | `HybridGate<T>`
 * 3. Uncomment the corresponding entry in STAGE_GATE_MAP below
 * 4. Import the gate at the top of this file
 *
 * ## Stage→gate assignments (per spec)
 *
 *  waiting_chase  → Gate 6 (hallucinated standards check — positioned RIGHT
 *                   after Chase research to catch standards before 9 stages
 *                   of downstream work compound the error)
 *  locking_brief  → Gate 1 (brief scope alignment — LLM vote)
 *  waiting_max    → Gate 2 (module key-parts completeness — deterministic)
 *  waiting_sizing → Gate 3 (solver feasibility — deterministic)
 *  matching_suppliers → Gate 5 (supplier liveness + ≥3 per BOM row — deterministic)
 *  waiting_finn   → Gate 4 (cost realism — hybrid, v2.1)
 *
 * @see src/lib/forge-v2/stage-gates/types.ts   — GateRunner interface
 * @see src/lib/forge-v2/stage-gates/runner.ts  — runGate() orchestrator
 */

import type { GateRunner } from "./types"
import type { AutopilotStage } from "@/actions/forge-v2-autopilot"

// ── Phase 2 gate imports (uncomment as each sub-agent lands) ───────────────
//
import { gate1 } from "./gate-1"
import { gate2 } from "./gate-2"
import { gate3 } from "./gate-3"
import { gate4 } from "./gate-4"
import { gate5 } from "./gate-5"
import { gate6 } from "./gate-6"

// ── Stage→gate map ──────────────────────────────────────────────────────────
//
// NOTE: The cron handler (`/api/cron/autopilot-tick/route.ts`) looks up the
// current stage in this map after each `done` advance. If the stage has an
// entry, runGate() is called. If not, the pipeline advances immediately.
//
// ENABLE_QUALITY_GATES=false means runGate() is a no-op regardless of what
// is registered here (see runner.ts feature flag).

export const STAGE_GATE_MAP: Partial<Record<AutopilotStage, GateRunner>> = {
    // Gate 6 — right after Chase research, before brief is locked.
    // Catches hallucinated standards before 9 stages compound the error.
    // NOTE: Gate 6 produces FAIL on missing-standards (hard) and intends WARN
    // on domain-coverage shortfall. The runner currently maps any
    // `passed: false → FAIL`. The cron handler should call
    // `resolveGate6Verdict()` after the verdict to reclassify domain-coverage
    // failures to WARN. (Tracked: post-Phase-2 follow-up in stage-gates/gate-6.ts.)
    waiting_chase: gate6,

    // Gate 1 — brief scope alignment (LLM vote). Runs after locking_brief.
    // Wired in once Gate 1 sub-agent lands. v2.0.
    locking_brief: gate1,

    // Gate 2 — module key-parts completeness (deterministic).
    // NOTE: Remediation injects `_gate2_remediation` context on the project
    // for targeted Max re-expansion. Cron handler must pass that context
    // through when re-firing Max for the failing modules only.
    waiting_max: gate2,

    // Gate 3 — solver feasibility check (deterministic).
    // Catches `dimension_sheet.feasible === false && module_dimensions populated`
    // (the INFEASIBLE-but-emitted pattern that produced the BESS/vertical-farm
    // stub PDFs in Loop 19). Attempt 1 re-fires Fang sizing with relaxed
    // constraints; attempt 2 escalates to Max re-decompose.
    waiting_sizing: gate3,

    // Gate 5 — supplier liveness + ≥3 per BOM row (deterministic).
    // NOTE: Gate 5's `check` is async (HEAD/GET liveness over the network)
    // but `DeterministicGate<T>.check` is currently typed sync. The gate's
    // implementation casts via `unknown as DeterministicCheckResult`; safe
    // because runner.ts awaits the runGate() result. Future refactor: widen
    // the interface to accept `Promise<DeterministicCheckResult>`.
    matching_suppliers: gate5,

    // Gate 4 — cost realism (hybrid — Oracle library primary + LLM secondary).
    // Deferred to v2.1 per spec.
    waiting_finn: gate4,
}
