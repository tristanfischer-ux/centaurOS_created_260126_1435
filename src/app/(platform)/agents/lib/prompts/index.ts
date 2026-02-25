import type { PromptTemplate } from "../agent-types"
import { STARTUP_STRATEGY_PROMPTS } from "./startup-strategy"
import { FUNDRAISING_PROMPTS } from "./fundraising"
import { MARKETING_CONTENT_PROMPTS } from "./marketing-content"
import { SALES_REVENUE_PROMPTS } from "./sales-revenue"
import { STRATEGY_PLANNING_PROMPTS } from "./strategy-planning"
import { PRODUCT_DEVELOPMENT_PROMPTS } from "./product-development"
import { FINANCE_OPERATIONS_PROMPTS } from "./finance-operations"
import { HR_PEOPLE_PROMPTS } from "./hr-people"
import { CUSTOMER_SUCCESS_PROMPTS } from "./customer-success"
import { LEGAL_COMPLIANCE_PROMPTS } from "./legal-compliance"
import { CREATIVE_DESIGN_PROMPTS } from "./creative-design"
import { DATA_ANALYTICS_PROMPTS } from "./data-analytics"
import { MANUFACTURING_MATERIALS_PROMPTS } from "./manufacturing-materials"
import { TECHNOLOGY_ARCHITECTURE_PROMPTS } from "./technology-architecture"
import { ENGINEERING_VELOCITY_PROMPTS } from "./engineering-velocity"
import { SUPPLY_CHAIN_PROMPTS } from "./supply-chain"
import { CHIEF_OF_STAFF_PROMPTS } from "./chief-of-staff"

export const PROMPT_LIBRARY: PromptTemplate[] = [
    ...STARTUP_STRATEGY_PROMPTS,
    ...FUNDRAISING_PROMPTS,
    ...MARKETING_CONTENT_PROMPTS,
    ...SALES_REVENUE_PROMPTS,
    ...STRATEGY_PLANNING_PROMPTS,
    ...PRODUCT_DEVELOPMENT_PROMPTS,
    ...FINANCE_OPERATIONS_PROMPTS,
    ...HR_PEOPLE_PROMPTS,
    ...CUSTOMER_SUCCESS_PROMPTS,
    ...LEGAL_COMPLIANCE_PROMPTS,
    ...CREATIVE_DESIGN_PROMPTS,
    ...DATA_ANALYTICS_PROMPTS,
    ...MANUFACTURING_MATERIALS_PROMPTS,
    ...TECHNOLOGY_ARCHITECTURE_PROMPTS,
    ...ENGINEERING_VELOCITY_PROMPTS,
    ...SUPPLY_CHAIN_PROMPTS,
    ...CHIEF_OF_STAFF_PROMPTS,
]

export function getPromptsByCategory(category: string): PromptTemplate[] {
    return PROMPT_LIBRARY.filter((p) => p.category === category)
}

export function searchPrompts(query: string): PromptTemplate[] {
    const q = query.toLowerCase()
    return PROMPT_LIBRARY.filter(
        (p) =>
            p.title.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q) ||
            p.tags.some((t) => t.toLowerCase().includes(q))
    )
}

export function getPromptById(id: string): PromptTemplate | undefined {
    return PROMPT_LIBRARY.find((p) => p.id === id)
}
