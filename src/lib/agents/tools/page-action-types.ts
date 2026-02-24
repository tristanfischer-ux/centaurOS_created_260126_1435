/**
 * @file page-action-types.ts -- Types and validation for page-specific actions.
 *
 * @description Defines the structured proposal format for page actions that
 * specialists can propose. Separate from external action types (permission-guard.ts)
 * to keep concerns clean: external actions target third-party services,
 * page actions mutate in-app data.
 *
 * @security Page actions are NEVER auto-executed. They create proposals that
 * require explicit user confirmation via the PageActionCard UI.
 *
 * @related
 * - Registry: src/lib/page-actions.ts
 * - External action types: src/lib/agents/tools/permission-guard.ts
 * - Card UI: src/components/specialists/page-action-card.tsx
 * - Executor: src/actions/page-action-executor.ts
 */

// ─── Types ──────────────────────────────────────────────────────────

/**
 * A structured proposal for a page-specific action, parsed from
 * PROPOSED_PAGE_ACTION blocks in specialist output.
 */
export interface ProposedPageAction {
    /** Matches PageAction.type from the registry (e.g. "create_finance_project") */
    type: string
    /** Human-readable title for the approval card */
    title: string
    /** Why the specialist is proposing this action */
    description: string
    /** The data to pass to the server action */
    payload: Record<string, unknown>
}

// ─── Validation ─────────────────────────────────────────────────────

/**
 * Validates a parsed JSON object as a ProposedPageAction.
 *
 * @description Performs structural validation: checks for required fields
 * (type, title, payload). Does not validate that the type exists in the
 * registry or that payload matches schema -- that happens at execution
 * time in the page-action-executor.
 *
 * @param parsed - Unknown value parsed from JSON
 * @returns Validated ProposedPageAction or null if invalid
 */
export function validatePageAction(parsed: unknown): ProposedPageAction | null {
    if (!parsed || typeof parsed !== "object") return null
    const action = parsed as Record<string, unknown>

    if (typeof action.type !== "string" || action.type.length === 0) return null
    if (typeof action.title !== "string" || action.title.length === 0) return null
    if (!action.payload || typeof action.payload !== "object") return null

    return {
        type: action.type,
        title: action.title,
        description: typeof action.description === "string" ? action.description : "",
        payload: action.payload as Record<string, unknown>,
    }
}
