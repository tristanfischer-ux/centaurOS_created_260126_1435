/**
 * Marketplace Filters - Helpers for mapping business functions to marketplace categories
 * Used by Org Blueprint to generate pre-filtered marketplace URLs when filling gaps
 */

import { BusinessFunctionCategory, CoverageType } from '@/types/org-blueprint'

// Marketplace categories as defined in the database
export type MarketplaceCategory = 'People' | 'Products' | 'Services' | 'AI'

// Subcategories within each marketplace category
export const MARKETPLACE_SUBCATEGORIES: Record<MarketplaceCategory, string[]> = {
    People: [
        'Fractional Executive',
        'Consultant',
        'Contractor',
        'Virtual Assistant',
        'Specialist'
    ],
    Products: [
        'Manufacturing',
        'Fabrication',
        'Electronics',
        'Materials',
        'Components'
    ],
    Services: [
        'Legal',
        'Financial',
        'HR',
        'Marketing',
        'Design',
        'Development'
    ],
    AI: [
        'Automation',
        'Analytics',
        'Writing',
        'Design',
        'Development',
        'Customer Service'
    ]
}

// Mapping from business function categories to marketplace categories
export const FUNCTION_TO_MARKETPLACE_MAP: Record<BusinessFunctionCategory, MarketplaceCategory[]> = {
    'Operations': ['People', 'Services', 'AI'],
    'Finance': ['People', 'Services', 'AI'],
    'Legal': ['Services', 'People'],
    'HR': ['Services', 'People', 'AI'],
    'Marketing': ['People', 'Services', 'AI'],
    'Sales': ['People', 'AI'],
    'Product': ['People', 'Services'],
    'Engineering': ['People', 'Services', 'AI'],
    'Customer Success': ['People', 'AI'],
    'Administration': ['People', 'AI']
}

// Specific function ID to marketplace search term mappings
export const FUNCTION_SEARCH_TERMS: Record<string, { categories: MarketplaceCategory[]; terms: string[] }> = {
    // Finance
    'fin-bookkeeping': { categories: ['People', 'Services'], terms: ['bookkeeper', 'accounting', 'QuickBooks'] },
    'fin-accounting': { categories: ['People', 'Services'], terms: ['accountant', 'CPA', 'financial reporting'] },
    'fin-tax': { categories: ['Services'], terms: ['tax advisor', 'tax preparation', 'CPA'] },
    'fin-fundraising': { categories: ['Services', 'People'], terms: ['fundraising', 'investor relations', 'pitch deck'] },
    
    // Legal
    'leg-corporate': { categories: ['Services'], terms: ['corporate lawyer', 'startup attorney', 'formation'] },
    'leg-contracts': { categories: ['Services', 'AI'], terms: ['contract review', 'legal templates', 'agreement'] },
    'leg-ip': { categories: ['Services'], terms: ['intellectual property', 'patent', 'trademark'] },
    'leg-compliance': { categories: ['Services'], terms: ['compliance', 'regulatory', 'audit'] },
    
    // HR
    'hr-recruiting': { categories: ['People', 'Services'], terms: ['recruiter', 'talent acquisition', 'hiring'] },
    'hr-payroll': { categories: ['Services', 'AI'], terms: ['payroll', 'HR software', 'benefits'] },
    'hr-culture': { categories: ['People'], terms: ['people operations', 'HR consultant', 'culture'] },
    
    // Marketing
    'mkt-brand': { categories: ['People', 'Services'], terms: ['brand designer', 'creative director', 'branding'] },
    'mkt-content': { categories: ['People', 'AI'], terms: ['content writer', 'copywriter', 'SEO'] },
    'mkt-demand-gen': { categories: ['People', 'Services'], terms: ['demand generation', 'marketing manager', 'growth'] },
    'mkt-pr': { categories: ['Services'], terms: ['PR agency', 'public relations', 'media'] },
    
    // Sales
    'sales-development': { categories: ['People'], terms: ['SDR', 'sales development', 'outbound'] },
    'sales-account-exec': { categories: ['People'], terms: ['account executive', 'sales rep', 'closer'] },
    'sales-ops': { categories: ['AI', 'People'], terms: ['sales ops', 'CRM', 'sales automation'] },
    
    // Product
    'prod-management': { categories: ['People'], terms: ['product manager', 'PM', 'fractional CPO'] },
    'prod-design': { categories: ['People', 'Services'], terms: ['UX designer', 'product designer', 'UI/UX'] },
    'prod-analytics': { categories: ['AI'], terms: ['analytics', 'product analytics', 'data'] },
    
    // Engineering
    'eng-frontend': { categories: ['People'], terms: ['frontend developer', 'React', 'web developer'] },
    'eng-backend': { categories: ['People'], terms: ['backend developer', 'API', 'engineer'] },
    'eng-devops': { categories: ['People', 'AI'], terms: ['DevOps', 'infrastructure', 'cloud'] },
    'eng-security': { categories: ['Services'], terms: ['security', 'pentest', 'cybersecurity'] },
    
    // Customer Success
    'cs-support': { categories: ['People', 'AI'], terms: ['customer support', 'help desk', 'chat'] },
    'cs-success': { categories: ['People'], terms: ['customer success', 'CSM', 'onboarding'] },
    
    // Administration
    'admin-ea': { categories: ['People', 'AI'], terms: ['executive assistant', 'VA', 'virtual assistant'] },
    'admin-office': { categories: ['People'], terms: ['office manager', 'operations', 'admin'] },
    
    // Operations
    'ops-general': { categories: ['People'], terms: ['operations manager', 'COO', 'business ops'] },
    'ops-supply-chain': { categories: ['Products', 'Services'], terms: ['supply chain', 'procurement', 'logistics'] },
    'ops-facilities': { categories: ['Services'], terms: ['facilities', 'office', 'real estate'] }
}

/**
 * Generates a marketplace URL with pre-applied filters based on a business function
 */
export function generateMarketplaceUrl(
    functionId: string,
    options?: {
        category?: MarketplaceCategory
        searchTerm?: string
    }
): string {
    const baseUrl = '/marketplace'
    const params = new URLSearchParams()

    // Get mapping for this function
    const mapping = FUNCTION_SEARCH_TERMS[functionId]
    
    // Set category (from mapping, options, or default)
    const category = options?.category || mapping?.categories[0] || 'People'
    params.set('tab', category)

    // Set search term if available
    const searchTerm = options?.searchTerm || mapping?.terms[0]
    if (searchTerm) {
        params.set('search', searchTerm)
    }

    return `${baseUrl}?${params.toString()}`
}

/**
 * Gets all relevant marketplace categories for a business function category
 */
export function getMarketplaceCategoriesForFunction(
    functionCategory: BusinessFunctionCategory
): MarketplaceCategory[] {
    return FUNCTION_TO_MARKETPLACE_MAP[functionCategory] || ['People', 'Services']
}

/**
 * Gets search suggestions for a specific function ID
 */
export function getSearchSuggestionsForFunction(
    functionId: string
): { categories: MarketplaceCategory[]; terms: string[] } {
    return FUNCTION_SEARCH_TERMS[functionId] || { categories: ['People'], terms: [] }
}

/**
 * Suggests marketplace category based on coverage type
 */
export function suggestCategoryFromCoverageType(
    coverageType: CoverageType
): MarketplaceCategory | null {
    const mapping: Partial<Record<CoverageType, MarketplaceCategory>> = {
        'fractional': 'People',
        'agency': 'Services',
        'ai_tool': 'AI',
        'outsourced': 'Services',
        'marketplace': 'People'
    }
    return mapping[coverageType] || null
}

/**
 * Builds a complete marketplace filter object for a gap
 */
export interface MarketplaceFilter {
    category: MarketplaceCategory
    subcategory?: string
    searchTerm?: string
    url: string
}

export function buildMarketplaceFilters(
    functionId: string,
    functionCategory: BusinessFunctionCategory
): MarketplaceFilter[] {
    const mapping = FUNCTION_SEARCH_TERMS[functionId]
    const categories = mapping?.categories || FUNCTION_TO_MARKETPLACE_MAP[functionCategory] || ['People']
    const terms = mapping?.terms || []

    return categories.map((category, index) => ({
        category,
        searchTerm: terms[index] || terms[0],
        url: generateMarketplaceUrl(functionId, { 
            category,
            searchTerm: terms[index] || terms[0]
        })
    }))
}

/**
 * Gets recommended providers/tools for filling a gap
 * This could be extended to actually query the marketplace
 */
export function getRecommendedSearches(
    functionId: string
): { label: string; url: string; category: MarketplaceCategory }[] {
    const mapping = FUNCTION_SEARCH_TERMS[functionId]
    if (!mapping) return []

    return mapping.terms.slice(0, 3).map((term, index) => ({
        label: term,
        url: generateMarketplaceUrl(functionId, {
            category: mapping.categories[Math.min(index, mapping.categories.length - 1)],
            searchTerm: term
        }),
        category: mapping.categories[Math.min(index, mapping.categories.length - 1)]
    }))
}
