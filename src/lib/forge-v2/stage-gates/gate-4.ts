import { createAdminClient } from "@/lib/supabase/admin"
import type { DeterministicGate, GateContext, DeterministicCheckResult } from "./types"

export interface Gate4Input {
    ai_cost_estimates: Record<string, unknown> | null
    modules: Record<string, unknown> | null
}

export const gate4: DeterministicGate<Gate4Input> = {
    kind: "deterministic",
    gateId: 4,
    name: "Gate 4: Cost Realism",
    loadInput: async (ctx: GateContext) => {
        const admin = createAdminClient()
        const { data } = await admin
            .from("cad_lab_projects")
            .select("ai_cost_estimates, modules")
            .eq("id", ctx.projectId)
            .maybeSingle()

        return {
            ai_cost_estimates: (data?.ai_cost_estimates as Record<string, unknown> | null) ?? null,
            modules: (data?.modules as Record<string, unknown> | null) ?? null
        }
    },
    check: (input: Gate4Input): DeterministicCheckResult => {
        if (!input.modules || Object.keys(input.modules).length === 0) {
            return {
                check_name: "Finn cost estimates",
                passed: true,
                actual: "No modules to cost",
                expected: "Cost estimates exist for all modules"
            }
        }
        
        if (!input.ai_cost_estimates) {
            return {
                check_name: "Finn cost estimates",
                passed: false,
                actual: "Missing ai_cost_estimates entirely",
                expected: "Cost estimates exist for all modules"
            }
        }

        const missingModules: string[] = []
        const zeroCostModules: string[] = []

        for (const moduleId of Object.keys(input.modules)) {
            const est = input.ai_cost_estimates[moduleId] as Record<string, unknown> | undefined
            if (!est) {
                missingModules.push(moduleId)
            } else if (typeof est.totalPerUnit === 'number' && est.totalPerUnit === 0) {
                zeroCostModules.push(moduleId)
            } else if (!est.totalPerUnit) {
                zeroCostModules.push(moduleId)
            }
        }

        const passed = missingModules.length === 0 && zeroCostModules.length === 0
        let actual = "All modules costed > 0"
        if (!passed) {
            const parts = []
            if (missingModules.length > 0) parts.push(`${missingModules.length} missing`)
            if (zeroCostModules.length > 0) parts.push(`${zeroCostModules.length} zero cost`)
            actual = parts.join(", ")
        }

        return {
            check_name: "Finn cost estimates",
            passed,
            actual,
            expected: "Cost estimates exist for all modules and > 0"
        }
    }
}
