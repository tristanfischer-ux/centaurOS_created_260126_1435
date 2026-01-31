/**
 * Types for Org Blueprint - Business Function Coverage
 * Tracks which business functions are covered, by whom, and identifies gaps
 */

// Coverage status for a business function
export type CoverageStatus = 'covered' | 'partial' | 'gap' | 'not_needed'

// How a function is being covered
export type CoverageType = 
    | 'internal_team'      // Covered by a team member
    | 'fractional'         // Covered by a fractional/part-time resource
    | 'agency'             // Covered by an external agency
    | 'ai_tool'            // Covered by an AI tool
    | 'founder'            // Founder is handling it directly
    | 'outsourced'         // Fully outsourced to a vendor
    | 'marketplace'        // Sourced via CentaurOS marketplace

// Priority level for uncovered functions
export type GapPriority = 'critical' | 'high' | 'medium' | 'low'

// Main business function categories
export type BusinessFunctionCategory = 
    | 'Operations'
    | 'Finance'
    | 'Legal'
    | 'HR'
    | 'Marketing'
    | 'Sales'
    | 'Product'
    | 'Engineering'
    | 'Customer Success'
    | 'Administration'

// A business function definition (canonical list)
export interface BusinessFunction {
    id: string
    name: string
    category: BusinessFunctionCategory
    description: string
    // Common subcategories within this function
    subcategories?: string[]
    // Whether this is typically critical for early-stage startups
    typicallyEarlyStage: boolean
    // Suggested marketplace categories to search when this is a gap
    marketplaceCategories?: string[]
}

// Coverage record for a specific function in a foundry
export interface FunctionCoverage {
    id: string
    foundry_id: string
    function_id: string
    function_name: string
    category: BusinessFunctionCategory
    status: CoverageStatus
    coverage_type: CoverageType | null
    // Who/what is covering this function
    covered_by?: {
        type: 'profile' | 'provider' | 'tool'
        id: string
        name: string
    }
    // If partial coverage, what percentage
    coverage_percentage?: number
    // Notes about the coverage
    notes?: string
    // When status is 'gap', priority for filling it
    gap_priority?: GapPriority
    // AI-suggested next steps for gaps
    suggested_actions?: string[]
    // Last assessment date
    last_assessed_at?: string
    created_at: string
    updated_at: string
}

// Input for AI gap assessment
export interface GapAssessmentInput {
    foundry_description: string
    industry?: string
    stage?: 'pre-seed' | 'seed' | 'series-a' | 'series-b' | 'growth'
    team_size?: number
    current_coverage?: Partial<Record<string, CoverageStatus>>
}

// Output from AI gap assessment
export interface GapAssessmentResult {
    assessed_functions: {
        function_id: string
        function_name: string
        category: BusinessFunctionCategory
        suggested_status: CoverageStatus
        reasoning: string
        priority_if_gap: GapPriority
        suggested_coverage_types: CoverageType[]
        marketplace_search_terms?: string[]
    }[]
    overall_coverage_score: number // 0-100
    critical_gaps: string[]
    recommendations: string[]
}

// Summary stats for dashboard widget
export interface BlueprintSummary {
    total_functions: number
    covered: number
    partial: number
    gaps: number
    not_needed: number
    coverage_percentage: number
    critical_gaps_count: number
    recent_changes: {
        function_name: string
        old_status: CoverageStatus
        new_status: CoverageStatus
        changed_at: string
    }[]
}

// Alias for BusinessFunctionCategory
export type FunctionCategory = BusinessFunctionCategory

// All available categories as a constant array
export const ALL_CATEGORIES: FunctionCategory[] = [
    'Operations',
    'Finance',
    'Legal',
    'HR',
    'Marketing',
    'Sales',
    'Product',
    'Engineering',
    'Customer Success',
    'Administration',
]

// Category coverage breakdown
export interface CategoryCoverage {
    category: FunctionCategory
    total: number
    covered: number
    partial: number
    gaps: number
    notApplicable: number
    coveragePercentage: number
}

// Overall coverage summary
export interface CoverageSummary {
    totalFunctions: number
    covered: number
    partial: number
    gaps: number
    notApplicable: number
    overallCoveragePercentage: number
    byCategory: CategoryCoverage[]
}

// Assessment answer from the wizard
export interface AssessmentAnswer {
    functionId: string
    status: CoverageStatus
    coveredBy?: string
    coveredByType?: 'internal' | 'external'
    notes?: string
}

// Color mappings for categories (for UI)
export const CATEGORY_COLORS: Record<FunctionCategory, string> = {
    'Operations': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    'Finance': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    'Legal': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    'HR': 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
    'Marketing': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    'Sales': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    'Product': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
    'Engineering': 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200',
    'Customer Success': 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
    'Administration': 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
}

// Color mappings for coverage status (for UI)
export const STATUS_COLORS: Record<CoverageStatus, { bg: string; text: string; border: string }> = {
    'covered': {
        bg: 'bg-status-success-light',
        text: 'text-status-success',
        border: 'border-status-success',
    },
    'partial': {
        bg: 'bg-status-warning-light',
        text: 'text-status-warning',
        border: 'border-status-warning',
    },
    'gap': {
        bg: 'bg-status-error-light',
        text: 'text-destructive',
        border: 'border-destructive',
    },
    'not_needed': {
        bg: 'bg-muted',
        text: 'text-muted-foreground',
        border: 'border-muted',
    },
}

// Default business functions for new foundries
export const DEFAULT_BUSINESS_FUNCTIONS: BusinessFunction[] = [
    // Operations
    { id: 'ops-general', name: 'General Operations', category: 'Operations', description: 'Day-to-day business operations and coordination', typicallyEarlyStage: true },
    { id: 'ops-supply-chain', name: 'Supply Chain', category: 'Operations', description: 'Procurement, inventory, and logistics', typicallyEarlyStage: false, marketplaceCategories: ['Products'] },
    { id: 'ops-facilities', name: 'Facilities', category: 'Operations', description: 'Office space, equipment, and physical assets', typicallyEarlyStage: false },
    
    // Finance
    { id: 'fin-bookkeeping', name: 'Bookkeeping', category: 'Finance', description: 'Recording financial transactions', typicallyEarlyStage: true, marketplaceCategories: ['People', 'Services'] },
    { id: 'fin-accounting', name: 'Accounting', category: 'Finance', description: 'Financial reporting and compliance', typicallyEarlyStage: true, marketplaceCategories: ['People', 'Services'] },
    { id: 'fin-tax', name: 'Tax Planning', category: 'Finance', description: 'Tax strategy and filings', typicallyEarlyStage: true, marketplaceCategories: ['Services'] },
    { id: 'fin-treasury', name: 'Treasury/Cash Management', category: 'Finance', description: 'Managing cash flow and banking', typicallyEarlyStage: true },
    { id: 'fin-fundraising', name: 'Fundraising Support', category: 'Finance', description: 'Investor relations and capital raising', typicallyEarlyStage: false, marketplaceCategories: ['Services'] },
    
    // Legal
    { id: 'leg-corporate', name: 'Corporate Legal', category: 'Legal', description: 'Company formation, governance, equity', typicallyEarlyStage: true, marketplaceCategories: ['Services'] },
    { id: 'leg-contracts', name: 'Contract Management', category: 'Legal', description: 'Drafting and reviewing agreements', typicallyEarlyStage: true, marketplaceCategories: ['Services', 'AI'] },
    { id: 'leg-ip', name: 'Intellectual Property', category: 'Legal', description: 'Patents, trademarks, copyrights', typicallyEarlyStage: false, marketplaceCategories: ['Services'] },
    { id: 'leg-compliance', name: 'Regulatory Compliance', category: 'Legal', description: 'Industry-specific regulations', typicallyEarlyStage: false, marketplaceCategories: ['Services'] },
    
    // HR
    { id: 'hr-recruiting', name: 'Recruiting', category: 'HR', description: 'Hiring and talent acquisition', typicallyEarlyStage: true, marketplaceCategories: ['People', 'Services'] },
    { id: 'hr-payroll', name: 'Payroll', category: 'HR', description: 'Salary processing and benefits', typicallyEarlyStage: true, marketplaceCategories: ['Services', 'AI'] },
    { id: 'hr-culture', name: 'Culture & People Ops', category: 'HR', description: 'Employee experience and engagement', typicallyEarlyStage: false },
    { id: 'hr-learning', name: 'Learning & Development', category: 'HR', description: 'Training and professional development', typicallyEarlyStage: false },
    
    // Marketing
    { id: 'mkt-brand', name: 'Brand & Creative', category: 'Marketing', description: 'Brand identity, design, messaging', typicallyEarlyStage: true, marketplaceCategories: ['People', 'Services'] },
    { id: 'mkt-content', name: 'Content Marketing', category: 'Marketing', description: 'Blog, social media, thought leadership', typicallyEarlyStage: true, marketplaceCategories: ['People', 'AI'] },
    { id: 'mkt-demand-gen', name: 'Demand Generation', category: 'Marketing', description: 'Lead generation and campaigns', typicallyEarlyStage: false, marketplaceCategories: ['People', 'Services'] },
    { id: 'mkt-pr', name: 'Public Relations', category: 'Marketing', description: 'Media relations and communications', typicallyEarlyStage: false, marketplaceCategories: ['Services'] },
    
    // Sales
    { id: 'sales-development', name: 'Sales Development', category: 'Sales', description: 'Outbound prospecting and qualification', typicallyEarlyStage: true, marketplaceCategories: ['People'] },
    { id: 'sales-account-exec', name: 'Account Executive', category: 'Sales', description: 'Closing deals and managing accounts', typicallyEarlyStage: true, marketplaceCategories: ['People'] },
    { id: 'sales-ops', name: 'Sales Operations', category: 'Sales', description: 'CRM, reporting, process optimization', typicallyEarlyStage: false, marketplaceCategories: ['AI'] },
    
    // Product
    { id: 'prod-management', name: 'Product Management', category: 'Product', description: 'Roadmap, prioritization, requirements', typicallyEarlyStage: true, marketplaceCategories: ['People'] },
    { id: 'prod-design', name: 'Product Design', category: 'Product', description: 'UX/UI design and research', typicallyEarlyStage: true, marketplaceCategories: ['People', 'Services'] },
    { id: 'prod-analytics', name: 'Product Analytics', category: 'Product', description: 'Usage data and user insights', typicallyEarlyStage: false, marketplaceCategories: ['AI'] },
    
    // Engineering
    { id: 'eng-frontend', name: 'Frontend Development', category: 'Engineering', description: 'Web and mobile UI development', typicallyEarlyStage: true, marketplaceCategories: ['People'] },
    { id: 'eng-backend', name: 'Backend Development', category: 'Engineering', description: 'APIs, databases, infrastructure', typicallyEarlyStage: true, marketplaceCategories: ['People'] },
    { id: 'eng-devops', name: 'DevOps/Infrastructure', category: 'Engineering', description: 'CI/CD, cloud, monitoring', typicallyEarlyStage: false, marketplaceCategories: ['People', 'AI'] },
    { id: 'eng-security', name: 'Security', category: 'Engineering', description: 'Application and infrastructure security', typicallyEarlyStage: false, marketplaceCategories: ['Services'] },
    
    // Customer Success
    { id: 'cs-support', name: 'Customer Support', category: 'Customer Success', description: 'Handling customer inquiries and issues', typicallyEarlyStage: true, marketplaceCategories: ['People', 'AI'] },
    { id: 'cs-success', name: 'Customer Success Management', category: 'Customer Success', description: 'Onboarding, adoption, retention', typicallyEarlyStage: false, marketplaceCategories: ['People'] },
    
    // Administration
    { id: 'admin-ea', name: 'Executive Assistant', category: 'Administration', description: 'Calendar, travel, administrative support', typicallyEarlyStage: false, marketplaceCategories: ['People', 'AI'] },
    { id: 'admin-office', name: 'Office Management', category: 'Administration', description: 'Office operations and vendor management', typicallyEarlyStage: false },
]
