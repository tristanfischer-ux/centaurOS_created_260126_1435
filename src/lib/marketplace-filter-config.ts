/**
 * @file marketplace-filter-config.ts
 * @description Defines which advanced filters appear for each marketplace category.
 * Used by MarketplaceFilterPanel to render context-aware filter controls.
 */

export type FilterType = 'toggle' | 'select' | 'multiselect' | 'text' | 'range'

export interface FilterOption {
    value: string
    label: string
}

export interface MarketplaceFilterConfig {
    id: string
    label: string
    type: FilterType
    /** Categories where this filter is visible. Empty = all categories. */
    categories: string[]
    /** Options for select/multiselect types. */
    options?: FilterOption[]
    /** Placeholder text for text inputs. */
    placeholder?: string
}

export const MARKETPLACE_FILTERS: MarketplaceFilterConfig[] = [
    {
        id: 'verifiedOnly',
        label: 'Verified Only',
        type: 'toggle',
        categories: [],
    },
    {
        id: 'minRating',
        label: 'Min Rating',
        type: 'select',
        categories: [],
        options: [
            { value: '4', label: '4+ stars' },
            { value: '3', label: '3+ stars' },
            { value: '2', label: '2+ stars' },
        ],
    },
    {
        id: 'rateRange',
        label: 'Rate Range',
        type: 'range',
        categories: ['People'],
    },
    {
        id: 'minExperience',
        label: 'Experience',
        type: 'select',
        categories: ['People'],
        options: [
            { value: '1', label: '1+ years' },
            { value: '3', label: '3+ years' },
            { value: '5', label: '5+ years' },
            { value: '10', label: '10+ years' },
        ],
    },
    {
        id: 'location',
        label: 'Location',
        type: 'text',
        categories: ['People', 'Products', 'Services'],
        placeholder: 'e.g. London, New York',
    },
    {
        id: 'availability',
        label: 'Availability',
        type: 'select',
        categories: ['People'],
        options: [
            { value: 'Full-time', label: 'Full-time' },
            { value: 'Part-time', label: 'Part-time' },
            { value: 'Contract', label: 'Contract' },
            { value: 'Freelance', label: 'Freelance' },
        ],
    },
    {
        id: 'skills',
        label: 'Skills / Expertise',
        type: 'multiselect',
        categories: ['People'],
        options: [
            { value: 'React', label: 'React' },
            { value: 'TypeScript', label: 'TypeScript' },
            { value: 'Python', label: 'Python' },
            { value: 'Node.js', label: 'Node.js' },
            { value: 'AWS', label: 'AWS' },
            { value: 'Finance', label: 'Finance' },
            { value: 'Marketing', label: 'Marketing' },
            { value: 'Design', label: 'Design' },
            { value: 'Sales', label: 'Sales' },
            { value: 'Operations', label: 'Operations' },
            { value: 'Legal', label: 'Legal' },
            { value: 'HR', label: 'HR' },
        ],
    },
]

/**
 * Returns filters relevant to the given category.
 * Filters with empty categories array are shown for all categories.
 */
export function getFiltersForCategory(category: string): MarketplaceFilterConfig[] {
    return MARKETPLACE_FILTERS.filter(
        (f) => f.categories.length === 0 || f.categories.includes(category)
    )
}
