/**
 * @file page-actions.ts
 *
 * @description Per-page action registry that defines executable mutations
 * specialists can propose. Each action maps to an existing server action
 * and requires explicit user approval before execution.
 *
 * @security Actions are NEVER auto-executed. They create proposals that
 * require explicit user confirmation via the PageActionCard UI.
 *
 * @related
 * - Page knowledge (informational): src/lib/page-knowledge.ts
 * - Action types + validation: src/lib/agents/tools/page-action-types.ts
 * - Action card UI: src/components/specialists/page-action-card.tsx
 * - Executor: src/actions/page-action-executor.ts
 * - Execute route: src/app/api/agents/execute/route.ts
 */

import type { SpecialistId } from "@/lib/agents/specialists-config"

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PageActionPayloadField {
    type: "string" | "number" | "boolean"
    description: string
    required: boolean
}

export interface PageAction {
    /** Unique action type identifier (e.g. "create_finance_project") */
    type: string
    /** Human-readable name (e.g. "Create Project") */
    name: string
    /** What this action does */
    description: string
    /** Schema describing the expected payload fields */
    payloadSchema: Record<string, PageActionPayloadField>
    /** Which specialist IDs can propose this action */
    allowedSpecialists: SpecialistId[]
}

// ─── Page Action Registry ───────────────────────────────────────────────────

interface PageActionEntry {
    /** Route pattern this applies to (exact or prefix) */
    route: string
    /** Available actions on this page */
    actions: PageAction[]
}

const PAGE_ACTIONS: PageActionEntry[] = [
    {
        route: "/finance/projects",
        actions: [
            {
                type: "create_finance_project",
                name: "Create Project",
                description: "Create a new finance project for P&L tracking.",
                payloadSchema: {
                    name: { type: "string", description: "Project name", required: true },
                    clientName: { type: "string", description: "Client or customer name", required: false },
                },
                allowedSpecialists: ["finance-lead", "chief-of-staff"],
            },
        ],
    },
    {
        route: "/new-objectives",
        actions: [
            {
                type: "create_objective",
                name: "Create Objective",
                description: "Create a new objective (OKR) to track a goal.",
                payloadSchema: {
                    title: { type: "string", description: "Objective title", required: true },
                    description: { type: "string", description: "Objective description", required: false },
                },
                allowedSpecialists: ["strategist", "chief-of-staff"],
            },
        ],
    },
    {
        route: "/new-tasks",
        actions: [
            {
                type: "create_task",
                name: "Create Task",
                description: "Create a new task to track work.",
                payloadSchema: {
                    title: { type: "string", description: "Task title", required: true },
                    description: { type: "string", description: "Task description", required: false },
                },
                allowedSpecialists: [
                    "chief-of-staff", "strategist", "finance-lead", "cto",
                    "vp-engineering", "vp-manufacturing", "vp-supply-chain",
                    "product-lead", "growth-marketer", "sales-lead",
                    "fundraising-advisor", "hiring-team", "legal-counsel",
                ],
            },
        ],
    },
]

// ─── Lookup Functions ───────────────────────────────────────────────────────

/**
 * Returns available page actions for a given route.
 *
 * @description Checks exact match first, then longest prefix match.
 * Same matching logic as getPageKnowledge().
 *
 * @param pathname - Current route (e.g. "/finance/projects")
 * @returns Array of PageAction or empty array
 */
export function getPageActions(pathname: string): PageAction[] {
    const normalized = pathname.replace(/\/$/, "") || "/"

    // Exact match
    const exact = PAGE_ACTIONS.find((entry) => entry.route === normalized)
    if (exact) return exact.actions

    // Prefix match (longest first)
    const prefixMatches = PAGE_ACTIONS.filter((entry) =>
        normalized.startsWith(entry.route),
    )
    if (prefixMatches.length > 0) {
        const best = prefixMatches.reduce((a, b) =>
            a.route.length >= b.route.length ? a : b,
        )
        return best.actions
    }

    return []
}

/**
 * Filters page actions to only those a specific specialist can propose.
 *
 * @param actions - All available page actions for the current route
 * @param specialistId - The specialist proposing actions
 * @returns Filtered array of actions this specialist can propose
 */
export function filterActionsBySpecialist(
    actions: PageAction[],
    specialistId: string,
): PageAction[] {
    return actions.filter((action) =>
        action.allowedSpecialists.includes(specialistId as SpecialistId),
    )
}

/**
 * Serializes page actions into a markdown block for AI system prompts.
 *
 * @param actions - Available page actions for the current route
 * @returns Markdown string for injection into system prompts
 */
export function serializePageActions(actions: PageAction[]): string {
    if (actions.length === 0) return ""

    const lines: string[] = []

    lines.push(`## Page Actions (Executable)`)
    lines.push("")
    lines.push(
        "You can propose real actions on the page the user is viewing. " +
        "When you have gathered enough information conversationally, propose an action " +
        "using the PROPOSED_PAGE_ACTION format below. The user must approve before it executes."
    )
    lines.push("")
    lines.push("**Important rules:**")
    lines.push("- Ask clarifying questions first to gather all required fields before proposing")
    lines.push("- Only propose when you have enough information to fill all required fields")
    lines.push("- Include all data in the payload — do not reference conversation context")
    lines.push("- Place PROPOSED_PAGE_ACTION blocks at the very end of your response")
    lines.push("")
    lines.push("### Available Actions")
    lines.push("")

    for (const action of actions) {
        lines.push(`**${action.name}** (\`${action.type}\`): ${action.description}`)

        const fields = Object.entries(action.payloadSchema)
        if (fields.length > 0) {
            lines.push("  Payload fields:")
            for (const [key, field] of fields) {
                const req = field.required ? "(required)" : "(optional)"
                lines.push(`  - \`${key}\` (${field.type}) ${req}: ${field.description}`)
            }
        }
        lines.push("")
    }

    lines.push("### Format")
    lines.push("")
    lines.push("```")
    lines.push("<!-- PROPOSED_PAGE_ACTION")
    lines.push(`{"type": "${actions[0].type}", "title": "Human-readable title", "description": "Why you're proposing this", "payload": {${Object.entries(actions[0].payloadSchema).map(([k]) => `"${k}": "..."`).join(", ")}}}`)
    lines.push("-->")
    lines.push("```")

    return lines.join("\n")
}
