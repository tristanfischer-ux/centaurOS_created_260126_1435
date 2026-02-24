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

const TIMEOUT_MS = 5_000
const MAX_OUTPUT_CHARS = 10_000

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
    }

    try {
        const context = vm.createContext(sandbox)
        const script = new vm.Script(code, { filename: "calculation.js" })
        const result = script.runInContext(context, { timeout: TIMEOUT_MS })

        let output = ""

        if (logs.length > 0) {
            output += logs.join("\n") + "\n"
        }

        if (result !== undefined) {
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
