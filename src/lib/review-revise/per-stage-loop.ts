/**
 * @file per-stage-loop.ts — Reusable review-and-revise loop for any
 * pipeline stage.
 *
 * @description Tristan-directed 2026-04-26 NIGHT (architecture decision
 * Option α). Each pipeline stage produces a draft → reviewer scores it
 * + finds issues → reviser updates the draft to address each issue →
 * re-score until threshold met OR retry cap hit. Customer sees only
 * the post-revise output. Replaces the "Engine self-review" appendix
 * pattern (which caught issues but never fixed them).
 *
 * @see ~/Downloads/forge-demos/PER-STAGE-REVIEW-REVISE-ARCHITECTURE.md
 *
 * Usage from a stage orchestrator:
 *
 *   const { finalOutput, iterations } = await runReviewReviseLoop({
 *       stageId: "fang.review",
 *       generator: () => fangReviewModule(moduleId, ...),
 *       reviewer: (output) => scoreFangReview(output, projectContext),
 *       reviser: (output, findings) => fangReviewWithFindings(moduleId, findings, ...),
 *       threshold: 7.0,
 *       maxRetries: 3,
 *   })
 *
 * The infrastructure logs every iteration's score + findings to
 * pipeline_runs.output_ref so the engineering trace is auditable. The
 * customer-facing PDF reads only `finalOutput`.
 */

export interface ReviewReviseIteration<TFindings> {
    /** ISO timestamp this iteration finished. */
    iteratedAtIso: string
    /** Reviewer score 0-10 for this iteration's output. */
    score: number
    /** Reviewer findings. Empty array when score >= threshold. */
    findings: TFindings
    /** True when this iteration was the original generation (no revise yet). */
    isOriginal: boolean
}

export interface ReviewReviseResult<TOutput, TFindings> {
    /** The final output the customer sees — post-revise (or original if it converged first try). */
    finalOutput: TOutput
    /** Per-iteration audit trail. iterations[0] is the original draft + its review. */
    iterations: Array<ReviewReviseIteration<TFindings>>
    /** True when the final iteration's score >= threshold. False = retry cap exhausted. */
    convergedToThreshold: boolean
    /** Final score from the final iteration. */
    finalScore: number
}

export interface ReviewReviseOptions<TOutput, TFindings> {
    /** Stage identifier for logging (e.g. "fang.review", "chase.regulatory"). */
    stageId: string
    /** Original generator. Called once at iteration 0. */
    generator: () => Promise<TOutput>
    /** Scores + finds issues in the output. Returns score 0-10 + findings. */
    reviewer: (output: TOutput) => Promise<{ score: number; findings: TFindings }>
    /** Updates the output to address findings. Called when score < threshold. */
    reviser: (output: TOutput, findings: TFindings) => Promise<TOutput>
    /** Score threshold above which the loop stops. Default 7.0. */
    threshold?: number
    /** Max revise attempts after the original. Default 3. */
    maxRetries?: number
    /** Optional: callback for each iteration so callers can persist mid-loop state. */
    onIteration?: (iter: ReviewReviseIteration<TFindings>) => Promise<void>
}

const DEFAULT_THRESHOLD = 7.0
const DEFAULT_MAX_RETRIES = 3

/**
 * Run a review-and-revise loop for a pipeline stage.
 *
 * Iteration 0 is the original generator's output. If its review score
 * is below threshold, iteration 1 calls the reviser with the original
 * findings to produce a revised output, which is itself reviewed. Loop
 * continues until score >= threshold OR maxRetries exceeded.
 *
 * Defensive: if reviewer or reviser throws, the loop returns the most
 * recent successful output (original at minimum). The pipeline never
 * fails because of a self-review subsystem failure.
 */
export async function runReviewReviseLoop<TOutput, TFindings>(
    opts: ReviewReviseOptions<TOutput, TFindings>,
): Promise<ReviewReviseResult<TOutput, TFindings>> {
    const threshold = opts.threshold ?? DEFAULT_THRESHOLD
    const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES
    const iterations: Array<ReviewReviseIteration<TFindings>> = []

    // Iteration 0 — original generation.
    let currentOutput: TOutput = await opts.generator()
    let currentReview: { score: number; findings: TFindings }
    try {
        currentReview = await opts.reviewer(currentOutput)
    } catch (err) {
        // Reviewer failed — log + return original. Never fail the stage.
        console.warn(
            `[review-revise:${opts.stageId}] reviewer threw on iteration 0:`,
            err instanceof Error ? err.message : err,
        )
        return {
            finalOutput: currentOutput,
            iterations: [],
            convergedToThreshold: false,
            finalScore: 0,
        }
    }

    {
        const iter: ReviewReviseIteration<TFindings> = {
            iteratedAtIso: new Date().toISOString(),
            score: currentReview.score,
            findings: currentReview.findings,
            isOriginal: true,
        }
        iterations.push(iter)
        if (opts.onIteration) {
            try {
                await opts.onIteration(iter)
            } catch {
                /* persist failures don't fail the loop */
            }
        }
    }

    // Revise loop: while below threshold and have retries left.
    let attempt = 0
    while (currentReview.score < threshold && attempt < maxRetries) {
        attempt++
        try {
            currentOutput = await opts.reviser(currentOutput, currentReview.findings)
        } catch (err) {
            console.warn(
                `[review-revise:${opts.stageId}] reviser threw on attempt ${attempt}:`,
                err instanceof Error ? err.message : err,
            )
            // Reviser failed — keep the previous output.
            break
        }
        try {
            currentReview = await opts.reviewer(currentOutput)
        } catch (err) {
            console.warn(
                `[review-revise:${opts.stageId}] reviewer threw on attempt ${attempt}:`,
                err instanceof Error ? err.message : err,
            )
            // Reviewer failed mid-loop — accept the current output.
            break
        }
        const iter: ReviewReviseIteration<TFindings> = {
            iteratedAtIso: new Date().toISOString(),
            score: currentReview.score,
            findings: currentReview.findings,
            isOriginal: false,
        }
        iterations.push(iter)
        if (opts.onIteration) {
            try {
                await opts.onIteration(iter)
            } catch {
                /* persist failures don't fail the loop */
            }
        }
    }

    return {
        finalOutput: currentOutput,
        iterations,
        convergedToThreshold: currentReview.score >= threshold,
        finalScore: currentReview.score,
    }
}
