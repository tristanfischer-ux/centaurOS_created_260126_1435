/**
 * @file registry.ts — Tool registry: maps specialist IDs to available tools.
 *
 * @description Central registry that:
 *   1. Maps tool names → async handler functions
 *   2. Maps specialist IDs → their available tool sets (definitions)
 *   3. Provides getToolsForSpecialist() to retrieve definitions for a specialist
 *   4. Provides executeToolCall() to run a tool by name with foundry isolation
 *
 * @related
 * - Tool definitions: src/lib/agents/tools/definitions.ts
 * - Tool handlers: src/lib/agents/tools/handlers/
 * - Execute route: src/app/api/agents/execute/route.ts (consumer)
 * - Specialist IDs: src/app/(platform)/agents/specialists-data.ts
 */

import type { ToolDefinition } from "@/lib/ai-providers/types"
import type { SpecialistId } from "@/app/(platform)/agents/specialists-data"
import type { ToolHandler, ToolHandlerContext } from "./handlers/common"

import {
    COMMON_TOOLS,
    TOOL_RUN_CALCULATION,
    TOOL_WEB_SEARCH,
    TOOL_WRITE_DOCUMENT,
    TOOL_QUERY_PAST_ADVICE,
    TOOL_QUERY_MARKETPLACE,
    FINANCE_TOOLS,
    FINANCE_COMPUTE_TOOLS,
    PROJECT_COMPUTE_TOOLS,
    TOOL_SCORE_SUPPLIERS,
    TOOL_ANALYZE_OUTREACH,
    ENGINEERING_TOOLS,
    ENGINEERING_COMPUTE_TOOLS,
    TOOL_RUN_ENGINEERING_CALC,
    TOOL_LOOKUP_MATERIAL,
    TOOL_LOOKUP_PROCESS,
    TOOL_LOOKUP_STANDARD,
    TOOL_CALCULATE_TOLERANCE_STACK,
    TOOL_SEARCH_SUPPLIERS,
    PRODUCT_TOOLS,
    PEOPLE_TOOLS,
    STRATEGY_TOOLS,
    MARKETING_TOOLS,
    LEGAL_TOOLS,
} from "./definitions"

import {
    handleQueryObjectives,
    handleQueryTasks,
    handleQueryTeamMembers,
    handleQueryActivityMetrics,
} from "./handlers/common"
import { handleQueryFinancialOverview } from "./handlers/finance"
import { handleQueryEngineeringMetrics } from "./handlers/engineering"
import {
    handleQueryProductRoadmap,
    handleQueryTeamOverview,
    handleQueryStrategicGoals,
} from "./handlers/domain"
import { handleRunCalculation } from "./handlers/compute"
import { handleWebSearch } from "./handlers/web-search"
import { handleQueryGrowthMetrics, handleQueryCompetitorLandscape } from "./handlers/marketing"
import { handleQueryComplianceStatus, handleQueryContractsOverview } from "./handlers/legal"
import { handleWriteDocument } from "./handlers/documents"
import { handleQueryPastAdvice } from "./handlers/memory-search"
import { handleAskSpecialist } from "./handlers/delegation"
import { handleQueryMarketplace } from "./handlers/marketplace"
import {
    handleRunEngineeringCalc,
    handleCalculateStress,
    handleCalculateToleranceStack,
    handleCalculateThermal,
    handleCalculateFastener,
    handleLookupMaterial,
    handleLookupProcess,
} from "./handlers/engineering-compute"
import {
    handleAnalyzeCashflow,
    handleAnalyzeBudgetVariance,
    handleCalculateUnitEconomics,
    handleForecastMetric,
} from "./handlers/finance-compute"
import {
    handleAnalyzeCriticalPath,
    handleAnalyzeWorkload,
    handlePredictCompletion,
} from "./handlers/project-compute"
import {
    handleScoreSuppliers,
    handleAnalyzeOutreachPerformance,
} from "./handlers/marketplace-compute"
import { handleLookupDesignStandard } from "./handlers/design-standards"
import { handleSearchSuppliers } from "./handlers/supplier-search"

// ─── Tool Name → Handler Map ─────────────────────────────────────────

const TOOL_HANDLERS: Record<string, ToolHandler> = {
    // Common tools
    query_objectives: handleQueryObjectives,
    query_tasks: handleQueryTasks,
    query_team_members: handleQueryTeamMembers,
    query_activity_metrics: handleQueryActivityMetrics,

    // Finance tools
    query_financial_overview: handleQueryFinancialOverview,

    // Engineering tools
    query_engineering_metrics: handleQueryEngineeringMetrics,

    // Product tools
    query_product_roadmap: handleQueryProductRoadmap,

    // People/HR tools
    query_team_overview: handleQueryTeamOverview,

    // Strategy tools
    query_strategic_goals: handleQueryStrategicGoals,

    // Marketing tools
    query_growth_metrics: handleQueryGrowthMetrics,
    query_competitor_landscape: handleQueryCompetitorLandscape,

    // Legal tools
    query_compliance_status: handleQueryComplianceStatus,
    query_contracts_overview: handleQueryContractsOverview,

    // Document & memory tools
    write_document: handleWriteDocument,
    query_past_advice: handleQueryPastAdvice,

    // Delegation tool
    ask_specialist: handleAskSpecialist,

    // Marketplace tool
    query_marketplace: handleQueryMarketplace,

    // Utility tools
    run_calculation: handleRunCalculation,
    web_search: handleWebSearch,

    // Finance computation tools
    analyze_cashflow: handleAnalyzeCashflow,
    analyze_budget_variance: handleAnalyzeBudgetVariance,
    calculate_unit_economics: handleCalculateUnitEconomics,
    forecast_metric: handleForecastMetric,

    // Project/strategy computation tools
    analyze_critical_path: handleAnalyzeCriticalPath,
    analyze_workload: handleAnalyzeWorkload,
    predict_completion: handlePredictCompletion,

    // Marketplace & outreach computation tools
    score_suppliers: handleScoreSuppliers,
    analyze_outreach_performance: handleAnalyzeOutreachPerformance,

    // Engineering computation tools (Python on Modal)
    run_engineering_calc: handleRunEngineeringCalc,
    calculate_stress: handleCalculateStress,
    calculate_tolerance_stack: handleCalculateToleranceStack,
    calculate_thermal: handleCalculateThermal,
    calculate_fastener: handleCalculateFastener,
    lookup_material: handleLookupMaterial,
    lookup_process: handleLookupProcess,
    lookup_design_standard: handleLookupDesignStandard,
    search_suppliers: handleSearchSuppliers,
}

// ─── Specialist → Tool Definitions Map ───────────────────────────────

/**
 * Maps each specialist ID to their available tool definitions.
 * All specialists get COMMON_TOOLS. Domain specialists get additional
 * domain-specific tools. Data-heavy specialists get run_calculation.
 */
const SPECIALIST_TOOLS: Record<SpecialistId, ToolDefinition[]> = {
    // Strategy — needs strategic goals + finance context + calculation + project analysis
    strategist: [...COMMON_TOOLS, ...STRATEGY_TOOLS, ...FINANCE_TOOLS, ...FINANCE_COMPUTE_TOOLS, ...PROJECT_COMPUTE_TOOLS, TOOL_RUN_CALCULATION],

    // CTO — engineering metrics + product roadmap + calculation + engineering compute
    cto: [
        ...COMMON_TOOLS,
        ...ENGINEERING_TOOLS,
        ...PRODUCT_TOOLS,
        TOOL_RUN_CALCULATION,
        TOOL_RUN_ENGINEERING_CALC,
        TOOL_LOOKUP_MATERIAL,
        TOOL_LOOKUP_PROCESS,
        TOOL_CALCULATE_TOLERANCE_STACK,
    ],

    // VP Engineering (Jian) — hardware engineering: stress, thermal, tolerance, fastener, material, process, standards
    "vp-engineering": [
        ...COMMON_TOOLS,
        ...ENGINEERING_COMPUTE_TOOLS,
        TOOL_RUN_ENGINEERING_CALC,
        TOOL_RUN_CALCULATION,
        TOOL_LOOKUP_STANDARD,
    ],

    // VP Manufacturing (Fang) — DFM reviews + engineering computation + standards
    "vp-manufacturing": [
        ...COMMON_TOOLS,
        ...ENGINEERING_COMPUTE_TOOLS,
        TOOL_RUN_ENGINEERING_CALC,
        TOOL_RUN_CALCULATION,
        TOOL_LOOKUP_STANDARD,
    ],

    // VP Supply Chain — supplier search + marketplace intel + material/process lookups + tolerance + scoring
    "vp-supply-chain": [
        ...COMMON_TOOLS,
        TOOL_SEARCH_SUPPLIERS,
        TOOL_QUERY_MARKETPLACE,
        TOOL_SCORE_SUPPLIERS,
        TOOL_LOOKUP_MATERIAL,
        TOOL_LOOKUP_PROCESS,
        TOOL_CALCULATE_TOLERANCE_STACK,
        TOOL_RUN_CALCULATION,
    ],

    // Product Lead — product roadmap + common + project analysis
    "product-lead": [...COMMON_TOOLS, ...PRODUCT_TOOLS, ...PROJECT_COMPUTE_TOOLS, TOOL_RUN_CALCULATION],

    // Growth Marketing — common + marketing tools + marketplace + calculation + outreach analytics
    "growth-marketer": [...COMMON_TOOLS, ...MARKETING_TOOLS, TOOL_QUERY_MARKETPLACE, TOOL_ANALYZE_OUTREACH, TOOL_RUN_CALCULATION],

    // Sales Lead — common + financial overview + marketplace + supplier scoring
    "sales-lead": [...COMMON_TOOLS, ...FINANCE_TOOLS, TOOL_QUERY_MARKETPLACE, TOOL_SCORE_SUPPLIERS],

    // Chief of Staff — needs everything for cross-functional coordination
    "chief-of-staff": [
        ...COMMON_TOOLS,
        ...STRATEGY_TOOLS,
        ...PEOPLE_TOOLS,
        ...FINANCE_TOOLS,
        ...FINANCE_COMPUTE_TOOLS,
        ...PROJECT_COMPUTE_TOOLS,
        TOOL_RUN_CALCULATION,
    ],

    // Finance Lead — finance tools + calculation + finance computation (core for CFO)
    "finance-lead": [...COMMON_TOOLS, ...FINANCE_TOOLS, ...FINANCE_COMPUTE_TOOLS, TOOL_RUN_CALCULATION],

    // Fundraising Advisor — finance tools + calculation + finance computation
    "fundraising-advisor": [...COMMON_TOOLS, ...FINANCE_TOOLS, ...FINANCE_COMPUTE_TOOLS, TOOL_RUN_CALCULATION],

    // People/HR — people tools + team overview
    "hiring-team": [...COMMON_TOOLS, ...PEOPLE_TOOLS],

    // Legal Counsel — common tools + legal tools
    "legal-counsel": [...COMMON_TOOLS, ...LEGAL_TOOLS],
}

// ─── Tool Result Cache (60s TTL) ─────────────────────────────────────
// INTENT: Data-query tools hit Supabase on every message. Caching with a short
// TTL avoids redundant queries within a conversation turn while keeping data fresh.
// Works on warm serverless instances; empty on cold starts (safe degradation).

const CACHEABLE_TOOLS = new Set([
    "query_objectives", "query_tasks", "query_team_members",
    "query_activity_metrics", "query_financial_overview",
    "query_engineering_metrics", "query_product_roadmap",
    "query_team_overview", "query_strategic_goals",
])

const TOOL_CACHE_TTL_MS = 60_000

const toolResultCache = new Map<string, { result: string; timestamp: number }>()

function getCacheKey(toolName: string, foundryId: string, args: Record<string, unknown>): string {
    return `${toolName}:${foundryId}:${JSON.stringify(args)}`
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Retrieves the tool definitions available to a specific specialist.
 *
 * @param specialistId - The specialist's canonical ID
 * @param options - Optional flags to control which tools are included
 * @returns Array of ToolDefinition objects for the specialist
 */
export function getToolsForSpecialist(
    specialistId: string,
    options?: {
        /** Include web_search tool for non-Claude providers. Claude uses native web search. */
        includeWebSearch?: boolean
    },
): ToolDefinition[] {
    const tools = SPECIALIST_TOOLS[specialistId as SpecialistId] ?? COMMON_TOOLS
    const result = [...tools]

    if (options?.includeWebSearch) {
        result.push(TOOL_WEB_SEARCH)
    }

    return result
}

/**
 * Executes a tool call by name, routing to the appropriate handler.
 *
 * @param toolName - The tool to execute (must match a key in TOOL_HANDLERS)
 * @param args - Arguments parsed from the model's tool call
 * @param ctx - Execution context with foundryId for tenant isolation
 * @returns Formatted markdown string with the tool's results
 *
 * @security All handlers enforce foundry_id isolation via ctx.foundryId.
 */
export async function executeToolCall(
    toolName: string,
    args: Record<string, unknown>,
    ctx: ToolHandlerContext,
): Promise<string> {
    const handler = TOOL_HANDLERS[toolName]
    if (!handler) {
        return `Unknown tool: ${toolName}. Available tools: ${Object.keys(TOOL_HANDLERS).join(", ")}`
    }

    // Check cache for data-query tools
    const isCacheable = CACHEABLE_TOOLS.has(toolName)
    if (isCacheable) {
        const key = getCacheKey(toolName, ctx.foundryId, args)
        const cached = toolResultCache.get(key)
        if (cached && Date.now() - cached.timestamp < TOOL_CACHE_TTL_MS) {
            return cached.result
        }
    }

    try {
        const result = await handler(args, ctx)

        // Store in cache for cacheable tools
        if (isCacheable) {
            const key = getCacheKey(toolName, ctx.foundryId, args)
            toolResultCache.set(key, { result, timestamp: Date.now() })
        }

        return result
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[ToolRegistry] Tool "${toolName}" failed:`, msg)
        return `Tool execution error (${toolName}): ${msg}`
    }
}
