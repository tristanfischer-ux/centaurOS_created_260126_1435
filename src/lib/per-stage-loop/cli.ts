/**
 * @file cli.ts — entry point for per-stage loop runs.
 *
 * @description Tristan-directed (2026-04-26 NIGHT). Run a single stage's
 * iteration loop without going through the full pipeline. Drops a JSON
 * report to src/lib/per-stage-loop/results/<stage>-loop-NN.json with
 * per-input scores + dimension breakdown + next-fix recommendation.
 *
 * Usage (from repo root, with env loaded):
 *   pnpm tsx src/lib/per-stage-loop/cli.ts chase-regulatory
 *   pnpm tsx src/lib/per-stage-loop/cli.ts max-decompose
 *   ...
 *
 * Future stages plug in by adding a StageAdapter to ADAPTERS below.
 */

// Load .env.local for local CLI runs. Vercel/production loads env via the
// platform; local CLI needs explicit dotenv. Synchronous require keeps it
// out of top-level-await territory.
try {
    /* eslint-disable @typescript-eslint/no-require-imports */
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const dotenv = require("dotenv")
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require("path")
    dotenv.config({ path: path.resolve(process.cwd(), ".env.local") })
} catch {
    // dotenv not installed — assume env is already populated
}

import { runStageLoop } from "./runner"
import { chaseRegulatoryAdapter } from "./adapters/chase-regulatory"
import { supplierMatchAdapter } from "./adapters/supplier-match"
import { maxDecomposeAdapter } from "./adapters/max-decompose"
import type { StageAdapter, StageName } from "./types"

const ADAPTERS: Record<string, StageAdapter> = {
    "chase-regulatory": chaseRegulatoryAdapter,
    "supplier-match": supplierMatchAdapter,
    "max-decompose": maxDecomposeAdapter,
}

async function main() {
    const stageArg = process.argv[2]
    if (!stageArg) {
        console.error("usage: cli.ts <stage-name>")
        console.error(`known stages: ${Object.keys(ADAPTERS).join(", ")}`)
        process.exit(1)
    }
    const adapter = ADAPTERS[stageArg]
    if (!adapter) {
        console.error(
            `unknown stage: ${stageArg}\nknown: ${Object.keys(ADAPTERS).join(", ")}`,
        )
        process.exit(1)
    }
    const result = await runStageLoop(adapter)
    console.log(`\n=== ${result.stage} loop ${result.loop} ===`)
    console.log(`aggregate score: ${result.aggregateScore.toFixed(2)} / 10`)
    if (result.deltaSincePrior !== null) {
        const sign = result.deltaSincePrior >= 0 ? "+" : ""
        console.log(`Δ since prior: ${sign}${result.deltaSincePrior.toFixed(2)}`)
    }
    console.log(`engine commit: ${result.engineCommit}`)
    console.log(`council cost: ${(result.totalCostPence / 100).toFixed(2)}p`)
    console.log(`\nper-input scores:`)
    for (const s of result.scores) {
        console.log(
            `  ${s.inputId.padEnd(12)} ${s.score.toFixed(1)}/10 — ${s.summary.slice(0, 80)}`,
        )
        if (s.nextFix) console.log(`    next fix: ${s.nextFix.slice(0, 120)}`)
    }
}

void main().catch((err) => {
    console.error("[per-stage-loop] failed:", err)
    process.exit(1)
})

// Suppress unused-name warning for StageName re-import use cases.
export type { StageName }
