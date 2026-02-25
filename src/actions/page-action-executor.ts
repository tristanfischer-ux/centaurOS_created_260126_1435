'use server'

/**
 * @file page-action-executor.ts -- Server-side executor for page-specific actions.
 *
 * @description Thin routing layer that validates the action type against the
 * registry, validates the payload, and delegates to the appropriate existing
 * server action. No new database logic -- reuses existing CRUD operations.
 *
 * @security
 * - All execution goes through existing server actions which enforce
 *   auth + foundry isolation via withAuth / getFoundryIdCached.
 * - Action type is validated against the registry (no arbitrary execution).
 * - Payload is validated against the schema before execution.
 *
 * @related
 * - Registry: src/lib/page-actions.ts
 * - Types: src/lib/agents/tools/page-action-types.ts
 * - Card UI: src/components/specialists/page-action-card.tsx
 */

import { getPageActions } from "@/lib/page-actions"
import type { PageAction } from "@/lib/page-actions"
import { createProject } from "@/actions/finance-projects"
import { createObjective } from "@/actions/objectives"
import { createTask } from "@/actions/tasks"
import { sanitizeErrorMessage } from '@/lib/security/sanitize'

// ─── Types ──────────────────────────────────────────────────────────

export interface PageActionResult {
    success: boolean
    error?: string
    data?: Record<string, unknown>
}

// ─── Validation ─────────────────────────────────────────────────────

/**
 * Validates a payload against a page action's schema.
 *
 * @description Checks that all required fields are present and that
 * field types match the schema. Returns an error message if invalid.
 */
function validatePayload(
    payload: Record<string, unknown>,
    action: PageAction,
): string | null {
    for (const [key, field] of Object.entries(action.payloadSchema)) {
        const value = payload[key]
        if (field.required && (value === undefined || value === null || value === "")) {
            return `Missing required field: ${key}`
        }
        if (value !== undefined && value !== null) {
            if (field.type === "string" && typeof value !== "string") {
                return `Field "${key}" must be a string`
            }
            if (field.type === "number" && typeof value !== "number") {
                return `Field "${key}" must be a number`
            }
            if (field.type === "boolean" && typeof value !== "boolean") {
                return `Field "${key}" must be a boolean`
            }
        }
    }
    return null
}

// ─── Executor ───────────────────────────────────────────────────────

/**
 * Executes a page action by routing to the appropriate server action.
 *
 * @description
 * 1. Validates action type exists in the registry
 * 2. Validates payload against the schema
 * 3. Routes to the existing server action
 * 4. Returns standardized result
 *
 * @param actionType - The action type (e.g. "create_finance_project")
 * @param payload - The data to pass to the server action
 * @returns Standardized result with success/error/data
 */
export async function executePageAction(
    actionType: string,
    payload: Record<string, unknown>,
): Promise<PageActionResult> {
    try {
        // SECURITY: Find the action definition across all registered routes.
        // This prevents execution of unregistered/arbitrary action types.
        const allRouteActions = ["/finance/projects", "/new-objectives", "/new-tasks"]
        let actionDef: PageAction | undefined
        for (const route of allRouteActions) {
            const actions = getPageActions(route)
            actionDef = actions.find((a) => a.type === actionType)
            if (actionDef) break
        }

        if (!actionDef) {
            return { success: false, error: `Unknown action type: ${actionType}` }
        }

        // Validate payload against schema
        const validationError = validatePayload(payload, actionDef)
        if (validationError) {
            return { success: false, error: validationError }
        }

        // Route to the appropriate server action
        switch (actionType) {
            case "create_finance_project": {
                const result = await createProject({
                    name: payload.name as string,
                    clientName: (payload.clientName as string) || undefined,
                })
                if (result.error) {
                    return { success: false, error: result.error }
                }
                return {
                    success: true,
                    data: {
                        id: result.data?.id,
                        name: result.data?.name,
                        redirectUrl: "/finance/projects",
                    },
                }
            }

            case "create_objective": {
                // createObjective uses FormData
                const formData = new FormData()
                formData.set("title", payload.title as string)
                if (payload.description) {
                    formData.set("description", payload.description as string)
                }
                const result = await createObjective(formData)
                if (result && typeof result === "object" && "error" in result) {
                    return { success: false, error: result.error as string }
                }
                return {
                    success: true,
                    data: { redirectUrl: "/new-objectives" },
                }
            }

            case "create_task": {
                // createTask uses FormData
                const formData = new FormData()
                formData.set("title", payload.title as string)
                if (payload.description) {
                    formData.set("description", payload.description as string)
                }
                const result = await createTask(formData)
                if (result && typeof result === "object" && "error" in result) {
                    return { success: false, error: result.error as string }
                }
                return {
                    success: true,
                    data: { redirectUrl: "/new-tasks" },
                }
            }

            default:
                return { success: false, error: `No handler for action type: ${actionType}` }
        }
    } catch (err) {
        console.error("[PageActionExecutor] Execution failed:", { actionType, err })
        return {
            success: false,
            error: sanitizeErrorMessage(err),
        }
    }
}
