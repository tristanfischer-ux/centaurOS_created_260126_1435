/**
 * @file definitions.ts — Tool definitions (JSON Schema format) for specialist AI tools.
 *
 * @description Defines the available tools that specialists can invoke during
 * conversation. Tools are organized into:
 *   - COMMON_TOOLS: Available to all specialists (query objectives, tasks, team, metrics)
 *   - Domain-specific sets: Finance, engineering, marketing, etc.
 *   - Utility tools: run_calculation, web_search
 *
 * Each definition follows the ToolDefinition interface from ai-providers/types.ts
 * (name, description, JSON Schema parameters).
 *
 * @related
 * - Tool types: src/lib/ai-providers/types.ts (ToolDefinition interface)
 * - Tool handlers: src/lib/agents/tools/handlers/ (implementations)
 * - Tool registry: src/lib/agents/tools/registry.ts (specialist → tool mapping)
 */

import type { ToolDefinition } from "@/lib/ai-providers/types"

// ─── Common Tools (All Specialists) ──────────────────────────────────

export const TOOL_QUERY_OBJECTIVES: ToolDefinition = {
    name: "query_objectives",
    description:
        "Query the company's current objectives (OKRs). Returns titles, descriptions, progress percentages, status, owner, and parent strategic goals. Use this to ground your advice in what the company is actually working toward.",
    parameters: {
        type: "object",
        properties: {
            status: {
                type: "string",
                enum: ["active", "completed", "archived", "all"],
                description: "Filter by objective status. Defaults to 'active'.",
            },
            limit: {
                type: "number",
                description: "Maximum number of objectives to return. Defaults to 20.",
            },
        },
        required: [],
    },
}

export const TOOL_QUERY_TASKS: ToolDefinition = {
    name: "query_tasks",
    description:
        "Query the company's tasks. Returns titles, descriptions, status, priority, assignee, due dates, and parent objective. Use this to understand what work is in progress, overdue, or blocked.",
    parameters: {
        type: "object",
        properties: {
            status: {
                type: "string",
                enum: ["todo", "in_progress", "done", "blocked", "all"],
                description: "Filter by task status. Defaults to 'all'.",
            },
            assignee_id: {
                type: "string",
                description: "Filter by assignee user ID.",
            },
            objective_id: {
                type: "string",
                description: "Filter by parent objective ID.",
            },
            priority: {
                type: "string",
                enum: ["urgent", "high", "medium", "low"],
                description: "Filter by priority level.",
            },
            limit: {
                type: "number",
                description: "Maximum number of tasks to return. Defaults to 30.",
            },
        },
        required: [],
    },
}

export const TOOL_QUERY_TEAM_MEMBERS: ToolDefinition = {
    name: "query_team_members",
    description:
        "Query the team members in the company. Returns names, roles, departments, and status. Use this to understand who is on the team and their responsibilities.",
    parameters: {
        type: "object",
        properties: {
            role: {
                type: "string",
                description: "Filter by role (e.g., 'founder', 'executive', 'apprentice').",
            },
            limit: {
                type: "number",
                description: "Maximum number of members to return. Defaults to 50.",
            },
        },
        required: [],
    },
}

export const TOOL_QUERY_ACTIVITY_METRICS: ToolDefinition = {
    name: "query_activity_metrics",
    description:
        "Query activity metrics for the company over a time period. Returns task completion rates, objective progress, active user counts, and recent activity summaries. Use this for performance analysis.",
    parameters: {
        type: "object",
        properties: {
            days: {
                type: "number",
                description: "Look-back period in days. Defaults to 7.",
            },
        },
        required: [],
    },
}

/** Tools available to every specialist. */
export const COMMON_TOOLS: ToolDefinition[] = [
    TOOL_QUERY_OBJECTIVES,
    TOOL_QUERY_TASKS,
    TOOL_QUERY_TEAM_MEMBERS,
    TOOL_QUERY_ACTIVITY_METRICS,
]

// ─── Computation Tool ────────────────────────────────────────────────

export const TOOL_RUN_CALCULATION: ToolDefinition = {
    name: "run_calculation",
    description:
        "Execute a JavaScript calculation in a sandboxed environment. Has access to Math, JSON, Date, Array, Object, Number, String, parseFloat, parseInt. Use this for financial models, unit economics, scenario analysis, growth projections, and any quantitative work. The last expression's value is returned as the result. You can use console.log() for intermediate output.",
    parameters: {
        type: "object",
        properties: {
            code: {
                type: "string",
                description:
                    "JavaScript code to execute. The value of the last expression is returned. Use console.log() for intermediate output.",
            },
        },
        required: ["code"],
    },
}

// ─── Web Search Tool (for non-Claude providers) ─────────────────────

export const TOOL_WEB_SEARCH: ToolDefinition = {
    name: "web_search",
    description:
        "Search the web for real-time information. Use this when the user asks about competitors, market data, pricing, recent events, regulations, or anything requiring current data. Returns a summary with sources.",
    parameters: {
        type: "object",
        properties: {
            query: {
                type: "string",
                description: "The search query. Be specific and include relevant context.",
            },
        },
        required: ["query"],
    },
}

// ─── Finance Tools ───────────────────────────────────────────────────

export const FINANCE_TOOLS: ToolDefinition[] = [
    {
        name: "query_financial_overview",
        description:
            "Query the company's financial overview including revenue range, funding stage, burn rate category, and team size from the company profile. Use this for high-level financial assessments.",
        parameters: {
            type: "object",
            properties: {},
            required: [],
        },
    },
]

// ─── Engineering Tools ───────────────────────────────────────────────

export const ENGINEERING_TOOLS: ToolDefinition[] = [
    {
        name: "query_engineering_metrics",
        description:
            "Query engineering-specific metrics: tasks by status (todo, in_progress, done, blocked), completion velocity over time, and overdue task counts. Use this for sprint reviews and engineering health checks.",
        parameters: {
            type: "object",
            properties: {
                days: {
                    type: "number",
                    description: "Look-back period in days. Defaults to 14 (one sprint).",
                },
            },
            required: [],
        },
    },
]

// ─── Product Tools ───────────────────────────────────────────────────

export const PRODUCT_TOOLS: ToolDefinition[] = [
    {
        name: "query_product_roadmap",
        description:
            "Query product-related objectives and tasks to understand the current roadmap, feature priorities, and delivery status. Returns objectives tagged as product-related with their child tasks.",
        parameters: {
            type: "object",
            properties: {
                include_completed: {
                    type: "boolean",
                    description: "Include completed objectives. Defaults to false.",
                },
            },
            required: [],
        },
    },
]

// ─── People/HR Tools ─────────────────────────────────────────────────

export const PEOPLE_TOOLS: ToolDefinition[] = [
    {
        name: "query_team_overview",
        description:
            "Query a detailed team overview including member count by role, recent joins, and department distribution. Use this for org health analysis, hiring recommendations, and team structure decisions.",
        parameters: {
            type: "object",
            properties: {},
            required: [],
        },
    },
]

// ─── Marketing Tools ─────────────────────────────────────────────

export const MARKETING_TOOLS: ToolDefinition[] = [
    {
        name: "query_growth_metrics",
        description:
            "Query growth and marketing-related metrics: objectives and tasks with growth/marketing keywords, activity trends over a configurable period, and completion velocity. Use this to assess marketing initiatives and growth momentum.",
        parameters: {
            type: "object",
            properties: {
                days: {
                    type: "number",
                    description: "Look-back period in days. Defaults to 30.",
                },
            },
            required: [],
        },
    },
    {
        name: "query_competitor_landscape",
        description:
            "Query the competitive landscape context: company profile (sector, stage, revenue range), strategic goals, and competitive positioning data. Use this for market analysis and competitive strategy.",
        parameters: {
            type: "object",
            properties: {},
            required: [],
        },
    },
]

// ─── Legal Tools ─────────────────────────────────────────────────

export const LEGAL_TOOLS: ToolDefinition[] = [
    {
        name: "query_compliance_status",
        description:
            "Query the compliance and risk status: high-risk/urgent tasks, blocked items, overdue work, and compliance-related tasks. Use this to assess legal risk exposure and compliance gaps.",
        parameters: {
            type: "object",
            properties: {},
            required: [],
        },
    },
    {
        name: "query_contracts_overview",
        description:
            "Query contracts and financial commitments: invoice history, funding pipeline, and vendor relationships. Use this to understand the company's contractual obligations and financial commitments.",
        parameters: {
            type: "object",
            properties: {},
            required: [],
        },
    },
]

// ─── Strategy Tools ──────────────────────────────────────────────────

export const STRATEGY_TOOLS: ToolDefinition[] = [
    {
        name: "query_strategic_goals",
        description:
            "Query top-level strategic goals and their child objectives with progress. Use this to assess strategic alignment, identify gaps, and evaluate overall company direction.",
        parameters: {
            type: "object",
            properties: {
                include_archived: {
                    type: "boolean",
                    description: "Include archived strategic goals. Defaults to false.",
                },
            },
            required: [],
        },
    },
]
