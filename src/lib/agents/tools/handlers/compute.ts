/**
 * @file compute.ts — Sandboxed JavaScript execution for specialist calculations.
 *
 * @description Provides a run_calculation tool that executes JavaScript in a
 * Node.js vm sandbox. Used by data-heavy specialists (Finn, Sage, Priya) for
 * financial models, unit economics, scenario analysis, and growth projections.
 *
 * @security
 * - Runs in a vm.Context with whitelisted globals only
 * - 5-second timeout prevents infinite loops
 * - No access to require, process, fs, network, or any Node.js APIs
 * - Output capped at 10KB to prevent memory abuse
 *
 * @related
 * - Tool definitions: src/lib/agents/tools/definitions.ts (TOOL_RUN_CALCULATION)
 * - Tool registry: src/lib/agents/tools/registry.ts
 */

import vm from "node:vm"
import type { ToolHandler } from "./common"
import { validateChartSpec } from "../chart-spec"

const TIMEOUT_MS = 5_000
const MAX_OUTPUT_CHARS = 10_000

// ─── Domain Libraries (pure JS, no npm deps) ───────────────────────

/** Financial calculation helpers exposed as `finance.*` in the sandbox. */
const financeLib = {
    /** Net Present Value: npv(rate, cashflows) — rate as decimal (0.1 = 10%) */
    npv(rate: number, cashflows: number[]): number {
        return cashflows.reduce((acc, cf, i) => acc + cf / Math.pow(1 + rate, i), 0)
    },

    /** Internal Rate of Return via Newton-Raphson approximation */
    irr(cashflows: number[], guess = 0.1, maxIter = 100, tol = 1e-7): number {
        let rate = guess
        for (let i = 0; i < maxIter; i++) {
            let npv = 0
            let dnpv = 0
            for (let j = 0; j < cashflows.length; j++) {
                const factor = Math.pow(1 + rate, j)
                npv += cashflows[j] / factor
                dnpv -= j * cashflows[j] / Math.pow(1 + rate, j + 1)
            }
            if (Math.abs(npv) < tol) return rate
            if (dnpv === 0) break
            rate -= npv / dnpv
        }
        return rate
    },

    /** Payback period in years (returns Infinity if never recovered) */
    paybackPeriod(cashflows: number[]): number {
        let cumulative = 0
        for (let i = 0; i < cashflows.length; i++) {
            cumulative += cashflows[i]
            if (cumulative >= 0) {
                // Interpolate within the period
                const prev = cumulative - cashflows[i]
                if (cashflows[i] === 0) return i
                return i + Math.abs(prev) / cashflows[i]
            }
        }
        return Infinity
    },

    /** Compound Annual Growth Rate */
    compoundGrowth(startValue: number, endValue: number, years: number): number {
        if (startValue <= 0 || years <= 0) return 0
        return Math.pow(endValue / startValue, 1 / years) - 1
    },

    /** Return on Investment as decimal */
    roi(gain: number, cost: number): number {
        if (cost === 0) return 0
        return (gain - cost) / cost
    },
}

/** Chart builder helpers exposed as `charts.*` in the sandbox. */
const chartsLib = {
    bar(title: string, data: Array<{ label: string; value: number; value2?: number }>, options?: { xLabel?: string; yLabel?: string; seriesName?: string; series2Name?: string }) {
        return { type: "bar", title, data, ...options }
    },
    line(title: string, data: Array<{ label: string; value: number; value2?: number }>, options?: { xLabel?: string; yLabel?: string; seriesName?: string; series2Name?: string }) {
        return { type: "line", title, data, ...options }
    },
    pie(title: string, data: Array<{ label: string; value: number }>) {
        return { type: "pie", title, data }
    },
    area(title: string, data: Array<{ label: string; value: number; value2?: number }>, options?: { xLabel?: string; yLabel?: string; seriesName?: string; series2Name?: string }) {
        return { type: "area", title, data, ...options }
    },
}

/** Statistical helpers exposed as `stats.*` in the sandbox. */
const statsLib = {
    mean(values: number[]): number {
        if (values.length === 0) return 0
        return values.reduce((a, b) => a + b, 0) / values.length
    },

    median(values: number[]): number {
        if (values.length === 0) return 0
        const sorted = [...values].sort((a, b) => a - b)
        const mid = Math.floor(sorted.length / 2)
        return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
    },

    stddev(values: number[]): number {
        if (values.length < 2) return 0
        const avg = statsLib.mean(values)
        const sumSq = values.reduce((acc, v) => acc + (v - avg) ** 2, 0)
        return Math.sqrt(sumSq / (values.length - 1))
    },

    percentile(values: number[], p: number): number {
        if (values.length === 0) return 0
        const sorted = [...values].sort((a, b) => a - b)
        const index = (p / 100) * (sorted.length - 1)
        const lower = Math.floor(index)
        const upper = Math.ceil(index)
        if (lower === upper) return sorted[lower]
        return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower)
    },
}

// ─── Handler ────────────────────────────────────────────────────────

export const handleRunCalculation: ToolHandler = async (args, _ctx) => {
    const code = args.code as string
    if (!code || typeof code !== "string") {
        return "Error: `code` parameter is required and must be a string."
    }

    if (code.length > 50_000) {
        return "Error: Code too long (max 50,000 characters)."
    }

    // Capture console.log output
    const logs: string[] = []
    const mockConsole = {
        log: (...logArgs: unknown[]) => {
            logs.push(logArgs.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" "))
        },
        warn: (...logArgs: unknown[]) => {
            logs.push(`[warn] ${logArgs.map((a) => String(a)).join(" ")}`)
        },
        error: (...logArgs: unknown[]) => {
            logs.push(`[error] ${logArgs.map((a) => String(a)).join(" ")}`)
        },
    }

    // Whitelisted globals — safe math/data operations only
    const sandbox: Record<string, unknown> = {
        Math,
        JSON,
        Date,
        Array,
        Object,
        Number,
        String,
        Boolean,
        parseFloat,
        parseInt,
        isNaN,
        isFinite,
        Infinity,
        NaN,
        undefined,
        null: null,
        console: mockConsole,
        // Utility helpers
        Map,
        Set,
        RegExp,
        // Domain libraries
        finance: financeLib,
        charts: chartsLib,
        stats: statsLib,
    }

    try {
        const context = vm.createContext(sandbox)
        const script = new vm.Script(code, { filename: "calculation.js" })
        const result = script.runInContext(context, { timeout: TIMEOUT_MS })

        let output = ""

        if (logs.length > 0) {
            output += logs.join("\n") + "\n"
        }

        // Check if result is a ChartSpec — wrap in CHART block for the renderer
        const chartSpec = result !== undefined ? validateChartSpec(result) : null
        if (chartSpec) {
            output += `\n<!-- CHART ${JSON.stringify(chartSpec)} -->`
        } else if (result !== undefined) {
            const resultStr =
                typeof result === "object"
                    ? JSON.stringify(result, null, 2)
                    : String(result)
            output += `\nResult: ${resultStr}`
        }

        if (output.length > MAX_OUTPUT_CHARS) {
            output = output.slice(0, MAX_OUTPUT_CHARS) + "\n...(output truncated)"
        }

        return output || "(no output)"
    } catch (err) {
        if (err instanceof Error) {
            if (err.message.includes("Script execution timed out")) {
                return "Error: Calculation timed out after 5 seconds. Simplify the code or reduce iterations."
            }
            return `Error: ${err.message}`
        }
        return `Error: ${String(err)}`
    }
}
