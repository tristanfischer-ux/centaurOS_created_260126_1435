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
// import { gate1 } from "./gate-1"
// import { gate2 } from "./gate-2"
// import { gate3 } from "./gate-3"
// import { gate5 } from "./gate-5"
// import { gate6 } from "./gate-6"

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
    // waiting_chase: gate6, // ← Gate 6 sub-agent fills this in

    // Gate 1 — brief scope alignment (LLM vote). Runs after locking_brief.
    // locking_brief: gate1, // ← Gate 1 sub-agent fills this in

    // Gate 2 — module key-parts completeness (deterministic).
    // waiting_max: gate2, // ← Gate 2 sub-agent fills this in

    // Gate 3 — solver feasibility check (deterministic).
    // waiting_sizing: gate3, // ← Gate 3 sub-agent fills this in

    // Gate 5 — supplier liveness + ≥3 per BOM row (deterministic).
    // matching_suppliers: gate5, // ← Gate 5 sub-agent fills this in

    // Gate 4 — cost realism (hybrid — Oracle library primary + LLM secondary).
    // Deferred to v2.1 as per spec.
    // waiting_finn: gate4,
}
