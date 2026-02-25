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

// ─── Document Persistence Tool ───────────────────────────────────

export const TOOL_WRITE_DOCUMENT: ToolDefinition = {
    name: "write_document",
    description:
        "Save a document (analysis, report, framework, template) for future reference. The document is persisted and can be retrieved later. Use this when you produce a substantial deliverable the founder may want to revisit.",
    parameters: {
        type: "object",
        properties: {
            title: {
                type: "string",
                description: "Document title (e.g., 'Q2 Financial Analysis', 'Hiring Framework').",
            },
            content: {
                type: "string",
                description: "Document content in the specified format.",
            },
            content_type: {
                type: "string",
                enum: ["markdown", "csv", "json"],
                description: "Content format. Defaults to 'markdown'.",
            },
        },
        required: ["title", "content"],
    },
}

// ─── Past Advice Search Tool ────────────────────────────────────

export const TOOL_QUERY_PAST_ADVICE: ToolDefinition = {
    name: "query_past_advice",
    description:
        "Search previous specialist conversations and knowledge base for relevant past advice. Use this to check what was previously recommended on a topic, avoid contradicting past guidance, or build on prior analysis.",
    parameters: {
        type: "object",
        properties: {
            query: {
                type: "string",
                description: "Search query (keywords describing the topic to find past advice about).",
            },
            specialist_id: {
                type: "string",
                description: "Optional: filter to a specific specialist's past advice.",
            },
            days: {
                type: "number",
                description: "Look-back period in days. Defaults to 90.",
            },
            limit: {
                type: "number",
                description: "Maximum number of results. Defaults to 10.",
            },
        },
        required: ["query"],
    },
}

// ─── Specialist Delegation Tool ──────────────────────────────────────

export const TOOL_ASK_SPECIALIST: ToolDefinition = {
    name: "ask_specialist",
    description:
        "Ask another specialist for their brief opinion on a topic. Use this when a question falls outside your domain — e.g., ask Finn about financial implications, Leo about legal risk, or Mia about marketing angles. The specialist will receive company data and respond in character. Max 2 delegations per turn.",
    parameters: {
        type: "object",
        properties: {
            specialist_id: {
                type: "string",
                enum: [
                    "strategist", "cto", "vp-engineering", "vp-manufacturing",
                    "vp-supply-chain", "product-lead", "growth-marketer", "sales-lead",
                    "chief-of-staff", "finance-lead", "fundraising-advisor",
                    "hiring-team", "legal-counsel",
                ],
                description: "The specialist to consult.",
            },
            question: {
                type: "string",
                description: "A specific question for the specialist. Be concise and focused.",
            },
        },
        required: ["specialist_id", "question"],
    },
}

/** Tools available to every specialist. */
export const COMMON_TOOLS: ToolDefinition[] = [
    TOOL_QUERY_OBJECTIVES,
    TOOL_QUERY_TASKS,
    TOOL_QUERY_TEAM_MEMBERS,
    TOOL_QUERY_ACTIVITY_METRICS,
    TOOL_WRITE_DOCUMENT,
    TOOL_QUERY_PAST_ADVICE,
    TOOL_ASK_SPECIALIST,
]

// ─── Computation Tool ────────────────────────────────────────────────

export const TOOL_RUN_CALCULATION: ToolDefinition = {
    name: "run_calculation",
    description:
        `Execute a JavaScript calculation in a sandboxed environment. Has access to Math, JSON, Date, Array, Object, Number, String, parseFloat, parseInt, Map, Set, RegExp.

Domain libraries available:

**finance.**
- finance.npv(rate, cashflows) — Net Present Value (rate as decimal, e.g. 0.1 for 10%)
- finance.irr(cashflows) — Internal Rate of Return
- finance.roi(gain, cost) — Return on Investment
- finance.paybackPeriod(cashflows) — Payback period in years
- finance.compoundGrowth(startValue, endValue, years) — CAGR
- finance.burnRate(expenses[]) — Average monthly burn from expense array
- finance.runway(cashBalance, monthlyBurn) — Months of runway remaining
- finance.unitEconomics(cac, monthlyRevenue, grossMarginPct?, monthlyChurnRate?) — Returns {ltv, ltvCacRatio, paybackMonths}
- finance.scenarioTable(baseValue, growthRates[], periods) — Multi-scenario comparison matrix

**charts.**
- charts.bar(title, data, options?) — Create a bar chart (data: [{label, value}])
- charts.line(title, data, options?) — Create a line chart
- charts.pie(title, data) — Create a pie chart
- charts.area(title, data, options?) — Create an area chart
  Options: {xLabel?, yLabel?, seriesName?, series2Name?}. Data points can include value2 for dual-series.

**stats.**
- stats.mean(values) — Arithmetic mean
- stats.median(values) — Median
- stats.stddev(values) — Sample standard deviation
- stats.percentile(values, p) — Percentile (p: 0-100)
- stats.linearRegression(xValues, yValues) — Returns {slope, intercept, rSquared}
- stats.movingAverage(values, windowSize) — Simple moving average
- stats.correlation(xValues, yValues) — Pearson correlation coefficient
- stats.growthRate(values) — Period-over-period growth rates array

**forecast.**
- forecast.linearForecast(history[], periodsAhead) — Linear trend extrapolation; returns {forecast[], slope, intercept, rSquared}
- forecast.exponentialSmoothing(values[], alpha?) — Single exponential smoothing; returns {smoothed[], nextForecast}

To output a chart, return a chart spec object using charts.bar(), charts.line(), etc. as the last expression.
The last expression's value is returned as the result. Use console.log() for intermediate output.`,
    parameters: {
        type: "object",
        properties: {
            code: {
                type: "string",
                description:
                    "JavaScript code to execute. The value of the last expression is returned. Use console.log() for intermediate output. Use finance.*, charts.*, stats.* for domain-specific calculations.",
            },
        },
        required: ["code"],
    },
}

// ─── Finance Computation Tools ──────────────────────────────────────

export const TOOL_ANALYZE_CASHFLOW: ToolDefinition = {
    name: "analyze_cashflow",
    description:
        "Analyze the company's cash flow using REAL expense and invoice data. Computes monthly inflows, outflows, burn rate, runway, expense breakdown by category, and optional projections. Use this when the founder asks about burn rate, runway, cash position, or spending trends — gives real numbers, not estimates.",
    parameters: {
        type: "object",
        properties: {
            time_horizon_months: {
                type: "number",
                description: "Number of months to analyze and project. Defaults to 6.",
            },
            include_projections: {
                type: "boolean",
                description: "Include trend-based projections for future months. Defaults to false.",
            },
        },
        required: [],
    },
}

export const TOOL_ANALYZE_BUDGET_VARIANCE: ToolDefinition = {
    name: "analyze_budget_variance",
    description:
        "Compare actual spending against budgets using REAL expense data. Shows over/under-spend per budget category, unbudgeted spending, and variance percentages. Use this when the founder asks about budget adherence, overspending, or financial discipline.",
    parameters: {
        type: "object",
        properties: {
            budget_id: {
                type: "string",
                description: "Specific budget ID to analyze. If omitted, analyzes all active budgets.",
            },
            period: {
                type: "string",
                enum: ["monthly", "quarterly"],
                description: "Analysis period. Defaults to 'monthly'.",
            },
        },
        required: [],
    },
}

export const TOOL_CALCULATE_UNIT_ECONOMICS: ToolDefinition = {
    name: "calculate_unit_economics",
    description:
        "Calculate unit economics (LTV, LTV/CAC ratio, payback period) from provided inputs. Use this when discussing customer acquisition cost, lifetime value, or SaaS metrics. You provide the numbers from the conversation context — the tool does the math correctly.",
    parameters: {
        type: "object",
        properties: {
            cac: {
                type: "number",
                description: "Customer Acquisition Cost (in the company's currency).",
            },
            monthly_revenue_per_customer: {
                type: "number",
                description: "Average monthly revenue per customer.",
            },
            gross_margin_pct: {
                type: "number",
                description: "Gross margin as a percentage (e.g., 70 for 70%). Defaults to 100.",
            },
            monthly_churn_rate: {
                type: "number",
                description: "Monthly churn rate as a decimal (e.g., 0.05 for 5%). Defaults to 0.01.",
            },
        },
        required: ["cac", "monthly_revenue_per_customer"],
    },
}

export const TOOL_FORECAST_METRIC: ToolDefinition = {
    name: "forecast_metric",
    description:
        "Forecast a financial metric (revenue or expenses) using REAL historical data and linear regression. Returns trend analysis, R² fit quality, projected values with confidence intervals, and a chart. Use this when the founder asks 'where are we heading?' or wants revenue/expense projections.",
    parameters: {
        type: "object",
        properties: {
            metric: {
                type: "string",
                enum: ["revenue", "expenses"],
                description: "Which metric to forecast. Defaults to 'expenses'.",
            },
            method: {
                type: "string",
                enum: ["linear", "exponential"],
                description: "Forecasting method. Defaults to 'linear'.",
            },
            periods_ahead: {
                type: "number",
                description: "Number of months to forecast ahead. Defaults to 3.",
            },
        },
        required: [],
    },
}

/** Finance computation tools that provide real calculations from company data. */
export const FINANCE_COMPUTE_TOOLS: ToolDefinition[] = [
    TOOL_ANALYZE_CASHFLOW,
    TOOL_ANALYZE_BUDGET_VARIANCE,
    TOOL_CALCULATE_UNIT_ECONOMICS,
    TOOL_FORECAST_METRIC,
]

// ─── Project/Strategy Computation Tools ─────────────────────────────

export const TOOL_ANALYZE_CRITICAL_PATH: ToolDefinition = {
    name: "analyze_critical_path",
    description:
        "Analyze the critical path through task dependencies using REAL task data. Identifies the longest dependency chain (which determines minimum project duration), bottleneck tasks that block the most work, and tasks with slack that can absorb delays. Use this when the founder asks about project timelines, bottlenecks, or 'what's blocking us?'",
    parameters: {
        type: "object",
        properties: {
            objective_id: {
                type: "string",
                description: "Optional: scope analysis to a specific objective. If omitted, analyzes all tasks.",
            },
        },
        required: [],
    },
}

export const TOOL_ANALYZE_WORKLOAD: ToolDefinition = {
    name: "analyze_workload",
    description:
        "Analyze task distribution across team members using REAL assignment data. Detects overloaded team members, identifies people with capacity, and lists unassigned tasks. Use this when the founder asks about team capacity, workload balance, or who can take on more work.",
    parameters: {
        type: "object",
        properties: {},
        required: [],
    },
}

export const TOOL_PREDICT_COMPLETION: ToolDefinition = {
    name: "predict_completion",
    description:
        "Predict objective completion dates based on REAL task completion velocity. Measures how fast tasks are actually being completed (last 30 days) and extrapolates when each objective will finish. Flags objectives that are behind schedule. Use this when the founder asks 'when will X be done?' or 'are we on track?'",
    parameters: {
        type: "object",
        properties: {
            objective_id: {
                type: "string",
                description: "Optional: predict for a specific objective. If omitted, predicts for all active objectives.",
            },
        },
        required: [],
    },
}

/** Project/strategy computation tools. */
export const PROJECT_COMPUTE_TOOLS: ToolDefinition[] = [
    TOOL_ANALYZE_CRITICAL_PATH,
    TOOL_ANALYZE_WORKLOAD,
    TOOL_PREDICT_COMPLETION,
]

// ─── Marketplace & Outreach Computation Tools ───────────────────────

export const TOOL_SCORE_SUPPLIERS: ToolDefinition = {
    name: "score_suppliers",
    description:
        "Score and rank suppliers based on REAL review data. Computes a weighted composite score from average rating, recommendation rate, and review volume. Use this when comparing suppliers, selecting vendors, or answering 'who should we work with?'",
    parameters: {
        type: "object",
        properties: {
            category: {
                type: "string",
                description: "Optional: filter suppliers by category.",
            },
            limit: {
                type: "number",
                description: "Maximum suppliers to return. Defaults to 20.",
            },
        },
        required: [],
    },
}

export const TOOL_ANALYZE_OUTREACH: ToolDefinition = {
    name: "analyze_outreach_performance",
    description:
        "Analyze outreach campaign performance from REAL email tracking data. Computes open rates, reply rates, conversion funnels by campaign and sequence position, and contact quality distribution. Use this when evaluating campaign effectiveness or planning future outreach.",
    parameters: {
        type: "object",
        properties: {
            campaign_id: {
                type: "string",
                description: "Optional: analyze a specific campaign. If omitted, analyzes all campaigns.",
            },
        },
        required: [],
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

// ─── Engineering Computation Tools ───────────────────────────────────

/**
 * Engineering computation tools backed by Python on Modal.
 * Unlike run_calculation (JS sandbox for finance), these have access to
 * numpy, scipy, sympy, and pint for real engineering math.
 */

export const TOOL_RUN_ENGINEERING_CALC: ToolDefinition = {
    name: "run_engineering_calc",
    description:
        "Execute a Python engineering calculation on Modal with access to numpy, scipy, sympy, and pint. Use this for custom engineering computations that don't fit the structured tools (calculate_stress, calculate_thermal, etc.). The script should print its result as JSON to stdout via json.dumps(). Available libraries: numpy, scipy, sympy, pint, math, json.",
    parameters: {
        type: "object",
        properties: {
            code: {
                type: "string",
                description:
                    "Python code to execute. Must print result as JSON to stdout. Has access to numpy, scipy, sympy, pint.",
            },
            description: {
                type: "string",
                description: "Brief description of what this calculation does (for logging).",
            },
        },
        required: ["code"],
    },
}

export const TOOL_CALCULATE_STRESS: ToolDefinition = {
    name: "calculate_stress",
    description:
        "Perform structural stress analysis on common geometry types. Returns maximum stress, safety factors against yield and ultimate failure, and a pass/fail verdict. Use this when evaluating whether a part will survive its intended loads. Supported geometry types: 'beam' (simply supported, center load), 'cylinder'/'pressure_vessel' (thin-wall hoop stress), 'column' (Euler buckling).",
    parameters: {
        type: "object",
        properties: {
            geometry_type: {
                type: "string",
                enum: ["beam", "cylinder", "pressure_vessel", "column"],
                description: "Type of structural element to analyze.",
            },
            load_N: {
                type: "number",
                description: "Applied load in Newtons. For beams: center point load. For columns: axial compressive load.",
            },
            material: {
                type: "string",
                description: "Material name or ID from the engineering database (e.g., 'al-6061-t6', 'Aluminum 6061-T6', 'steel 4140').",
            },
            // Beam/column dimensions
            length_mm: {
                type: "number",
                description: "Length/span in mm (beams and columns).",
            },
            width_mm: {
                type: "number",
                description: "Cross-section width in mm (beams and columns).",
            },
            height_mm: {
                type: "number",
                description: "Cross-section height in mm (beams and columns).",
            },
            // Cylinder/pressure vessel dimensions
            pressure_MPa: {
                type: "number",
                description: "Internal pressure in MPa (pressure vessels).",
            },
            outer_diameter_mm: {
                type: "number",
                description: "Outer diameter in mm (pressure vessels).",
            },
            wall_thickness_mm: {
                type: "number",
                description: "Wall thickness in mm (pressure vessels).",
            },
            // Column options
            end_condition: {
                type: "string",
                enum: ["fixed-fixed", "fixed-pinned", "pinned-pinned", "fixed-free"],
                description: "Column end conditions for buckling analysis. Defaults to 'pinned-pinned'.",
            },
        },
        required: ["geometry_type", "load_N", "material"],
    },
}

export const TOOL_CALCULATE_TOLERANCE_STACK: ToolDefinition = {
    name: "calculate_tolerance_stack",
    description:
        "Perform tolerance stack-up analysis using worst-case, RSS (root sum square), and Monte Carlo methods. Use this when checking if multiple mating parts will fit together within their tolerance bands. Returns total stack range, interference probability, and gap analysis.",
    parameters: {
        type: "object",
        properties: {
            dimensions: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        nominal_mm: {
                            type: "number",
                            description: "Nominal dimension in mm.",
                        },
                        tolerance_mm: {
                            type: "number",
                            description: "Bilateral tolerance (±) in mm.",
                        },
                    },
                    required: ["nominal_mm", "tolerance_mm"],
                },
                description: "Array of dimensions with their tolerances. Minimum 2 dimensions.",
            },
            method: {
                type: "string",
                enum: ["worst_case", "rss", "monte_carlo"],
                description: "Primary analysis method. All three are always computed, but this sets the focus. Defaults to 'rss'.",
            },
            target_gap_mm: {
                type: "number",
                description: "Target gap/clearance in mm. If provided, performs gap interference analysis.",
            },
        },
        required: ["dimensions"],
    },
}

export const TOOL_CALCULATE_THERMAL: ToolDefinition = {
    name: "calculate_thermal",
    description:
        "Perform steady-state thermal analysis for heat dissipation. Calculates temperature rise from power dissipation through conduction and convection. Use this to check if a component will overheat under operating conditions. Returns max temperature, thermal resistances, and comparison against material limits.",
    parameters: {
        type: "object",
        properties: {
            power_w: {
                type: "number",
                description: "Power dissipation in Watts.",
            },
            material: {
                type: "string",
                description: "Material name or ID from the engineering database.",
            },
            surface_area_mm2: {
                type: "number",
                description: "Total exposed surface area in mm². This is the area available for heat dissipation.",
            },
            thickness_mm: {
                type: "number",
                description: "Material thickness for conduction calculation in mm. Defaults to 5mm.",
            },
            ambient_temp_c: {
                type: "number",
                description: "Ambient temperature in °C. Defaults to 25°C.",
            },
            convection_coefficient: {
                type: "number",
                description: "Convection heat transfer coefficient in W/(m²·K). Defaults to 10 (natural convection in still air). Use ~25 for light breeze, ~50 for forced air, ~500-5000 for water cooling.",
            },
        },
        required: ["power_w", "material", "surface_area_mm2"],
    },
}

export const TOOL_CALCULATE_FASTENER: ToolDefinition = {
    name: "calculate_fastener",
    description:
        "Analyze a bolted joint: preload force, bolt stress, safety factors against proof load and joint separation. Use this when sizing bolts or verifying existing fastener selections. Returns recommended torque, clamping force, and pass/fail verdict.",
    parameters: {
        type: "object",
        properties: {
            bolt_size: {
                type: "string",
                description: "Metric bolt size (e.g., 'M3', 'M8', 'M12').",
            },
            grade: {
                type: "string",
                enum: ["4.6", "4.8", "5.8", "8.8", "10.9", "12.9"],
                description: "Bolt property class. Defaults to '8.8'.",
            },
            preload_torque_Nm: {
                type: "number",
                description: "Applied tightening torque in Nm. If omitted, uses 75% of proof load (recommended).",
            },
            external_load_N: {
                type: "number",
                description: "External tensile load on the joint in Newtons. Defaults to 0.",
            },
            joint_material: {
                type: "string",
                description: "Material of the clamped joint members. Affects stiffness ratio. Defaults to 'steel'.",
            },
        },
        required: ["bolt_size"],
    },
}

export const TOOL_LOOKUP_MATERIAL: ToolDefinition = {
    name: "lookup_material",
    description:
        "Query the engineering material properties database. Returns REAL values from MatWeb/ASM — not LLM estimates. Use this whenever you need material properties for calculations, design decisions, or recommendations. Covers ~40 metals, polymers, composites, and ceramics with mechanical, thermal, and manufacturing data.",
    parameters: {
        type: "object",
        properties: {
            material_name: {
                type: "string",
                description: "Material name or ID (e.g., 'al-6061-t6', 'Aluminum 6061-T6', 'PLA', 'stainless 316'). Supports fuzzy matching.",
            },
            property: {
                type: "string",
                description: "Optional: return only a specific property (e.g., 'yield_strength_mpa', 'thermal_conductivity_w_mk', 'cost_per_kg_usd'). If omitted, returns the full material data card.",
            },
        },
        required: ["material_name"],
    },
}

export const TOOL_LOOKUP_PROCESS: ToolDefinition = {
    name: "lookup_process",
    description:
        "Query the manufacturing process constraints database. Returns REAL constraints (min wall thickness, achievable tolerances, max part size, compatible materials, design rules, economics). Use this when evaluating manufacturability or recommending a process. Covers FDM, SLA, SLS, DMLS, CNC, Sheet Metal, Injection Molding, Casting, EDM, Waterjet, Laser Cutting, and more.",
    parameters: {
        type: "object",
        properties: {
            process_name: {
                type: "string",
                description: "Process name or ID (e.g., 'fdm', 'cnc-3-axis', 'injection-molding'). Supports fuzzy matching.",
            },
            for_material: {
                type: "string",
                description: "Material ID to find compatible processes for. Use this instead of process_name to get a list of all processes that work with a given material.",
            },
        },
        required: [],
    },
}

/** All engineering computation tools. */
export const ENGINEERING_COMPUTE_TOOLS: ToolDefinition[] = [
    TOOL_CALCULATE_STRESS,
    TOOL_CALCULATE_TOLERANCE_STACK,
    TOOL_CALCULATE_THERMAL,
    TOOL_CALCULATE_FASTENER,
    TOOL_LOOKUP_MATERIAL,
    TOOL_LOOKUP_PROCESS,
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

// ─── Marketplace Tool ────────────────────────────────────────────────

export const TOOL_QUERY_MARKETPLACE: ToolDefinition = {
    name: "query_marketplace",
    description:
        "Query marketplace intelligence based on a specific focus area. Use `sales_pipeline` for revenue indicators, invoices, and deals. Use `market_positioning` for company profile and competitive context. Use `supply_capacity` for team capacity, supply chain tasks, and overdue items.",
    parameters: {
        type: "object",
        properties: {
            focus: {
                type: "string",
                enum: ["sales_pipeline", "market_positioning", "supply_capacity"],
                description: "The marketplace focus area to query.",
            },
        },
        required: ["focus"],
    },
}

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
