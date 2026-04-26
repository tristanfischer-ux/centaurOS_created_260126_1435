/**
 * @file per-stage-loop/runner.ts — orchestrate one per-stage loop iteration.
 *
 * @description Drives a StageAdapter through one full iteration: load
 * golden inputs → run specialist on each → fire council critique →
 * aggregate score → persist result to disk. Independent of any
 * full-pipeline state — runs purely in-memory + writes outputs to
 * `src/lib/per-stage-loop/results/<stage>-loop-<N>.json`.
 */

import { promises as fs } from "fs"
import path from "path"
import { execFile } from "child_process"
import { promisify } from "util"
import type {
    StageAdapter,
    StageGoldenInput,
    StageLoopResult,
    StageName,
    StageScore,
} from "./types"

const RESULTS_DIR = path.resolve(
    process.cwd(),
    "src/lib/per-stage-loop/results",
)

const execFileAsync = promisify(execFile)

async function getEngineCommit(): Promise<string> {
    try {
        const { stdout } = await execFileAsync("git", ["rev-parse", "--short", "HEAD"])
        return stdout.trim()
    } catch {
        return "unknown"
    }
}

async function loadPriorResult(
    stage: StageName,
): Promise<StageLoopResult | null> {
    try {
        const files = (await fs.readdir(RESULTS_DIR))
            .filter((f) => f.startsWith(`${stage}-loop-`) && f.endsWith(".json"))
            .sort()
        if (files.length === 0) return null
        const latest = files[files.length - 1]
        const raw = await fs.readFile(path.join(RESULTS_DIR, latest), "utf8")
        return JSON.parse(raw) as StageLoopResult
    } catch {
        return null
    }
}

export async function runStageLoop(
    adapter: StageAdapter,
): Promise<StageLoopResult> {
    const ok = await adapter.selfCheck()
    if (!ok.ok) {
        throw new Error(`stage-loop[${adapter.name}] self-check failed: ${ok.error}`)
    }

    await fs.mkdir(RESULTS_DIR, { recursive: true })

    const inputs: StageGoldenInput[] = await adapter.loadGoldenInputs()
    const prior = await loadPriorResult(adapter.name)
    const loop = (prior?.loop ?? 0) + 1
    const engineCommit = await getEngineCommit()

    console.info(
        `[per-stage-loop] ${adapter.name} starting loop ${loop} on commit ${engineCommit}, ${inputs.length} inputs`,
    )

    // Run the specialist on each input. Keep sequential for now; can
    // parallelise per stage if the underlying specialist is reentrant.
    const outputs = []
    for (const input of inputs) {
        const t0 = Date.now()
        const output = await adapter.runOne(input)
        const elapsedMs = Date.now() - t0
        outputs.push({ ...output, loop, engineCommit, elapsedMs })
        console.info(
            `[per-stage-loop] ${adapter.name} ran ${input.id} in ${elapsedMs}ms`,
        )
    }

    // Fire council on each output. Parallel-safe — uses ask_alt_llm.
    const scoreSettled = await Promise.allSettled(
        outputs.map((output, i) => adapter.fireCouncil(inputs[i], output)),
    )
    const scores: StageScore[] = scoreSettled.map((r) => {
        if (r.status === "fulfilled") return r.value
        return {
            inputId: "unknown",
            score: 0,
            dimensions: {},
            summary: `council failed: ${r.reason}`,
            nextFix: null,
            costPence: 0,
        }
    })

    const aggregateScore =
        scores.length > 0
            ? scores.reduce((acc, s) => acc + s.score, 0) / scores.length
            : 0
    const totalCostPence =
        outputs.reduce((acc, o) => acc + o.costPence, 0) +
        scores.reduce((acc, s) => acc + s.costPence, 0)
    const deltaSincePrior =
        prior && typeof prior.aggregateScore === "number"
            ? aggregateScore - prior.aggregateScore
            : null

    const result: StageLoopResult = {
        stage: adapter.name,
        loop,
        engineCommit,
        inputs: inputs.length,
        outputs,
        scores,
        aggregateScore,
        deltaSincePrior,
        totalCostPence,
        completedAt: new Date().toISOString(),
    }

    const filename = `${adapter.name}-loop-${String(loop).padStart(2, "0")}.json`
    await fs.writeFile(
        path.join(RESULTS_DIR, filename),
        JSON.stringify(result, null, 2),
        "utf8",
    )
    console.info(
        `[per-stage-loop] ${adapter.name} loop ${loop} score=${aggregateScore.toFixed(2)}` +
            (deltaSincePrior !== null
                ? ` (Δ${deltaSincePrior >= 0 ? "+" : ""}${deltaSincePrior.toFixed(2)})`
                : "") +
            ` cost=${(totalCostPence / 100).toFixed(2)}p`,
    )

    return result
}
