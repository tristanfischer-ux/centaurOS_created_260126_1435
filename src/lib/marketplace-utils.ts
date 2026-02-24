/**
 * @file marketplace-utils.ts
 * @description Utilities for safely handling marketplace listing attributes.
 * Attributes can arrive as JSONB objects or JSON strings; these helpers normalize
 * and coerce values to prevent character-by-character rendering bugs.
 */

// ─── Attribute Display Helpers ───────────────────────────────────────────────

/**
 * Human-readable labels for known attribute keys.
 * Keys not listed here fall through to `formatAttributeLabel()`.
 */
export const ATTRIBUTE_LABELS: Record<string, string> = {
  website_url: 'Website',
  company_history: 'Company History',
  founded_year: 'Founded',
  company_size: 'Company Size',
  geographic_reach: 'Geographic Reach',
  headquarters: 'Headquarters',
  industry_focus: 'Industry Focus',
  min_order_value: 'Minimum Order Value',
  max_concurrent_orders: 'Max Concurrent Orders',
  available_slots: 'Available Slots',
  response_time_hours: 'Response Time',
  total_bookings: 'Times Hired',
  total_reviews: 'Total Reviews',
  rating_average: 'Rating',
  day_rate: 'Day Rate',
  years_experience: 'Years of Experience',
  previous_companies: 'Previous Companies',
  focus_areas: 'Focus Areas',
  use_cases: 'Use Cases',
  target_audience: 'Target Audience',
  delivery_method: 'Delivery Method',
  support_level: 'Support Level',
  api_available: 'API Available',
  free_trial: 'Free Trial',
  setup_time: 'Setup Time',
  contract_length: 'Contract Length',
  payment_terms: 'Payment Terms',
  warranty_period: 'Warranty Period',
  return_policy: 'Return Policy',
}

/**
 * Attributes hidden from the "Additional Details" section because they are
 * either internal/technical or already shown in dedicated UI sections.
 */
export const HIDDEN_ATTRIBUTES = new Set([
  // Internal / technical fields
  'provider_id',
  'embedding',
  'search_vector',
  'is_factory_enriched',
  'enriched_at',
  // Already displayed in header or category-specific sections
  'headline',
  'rating_average',
  'total_reviews',
  'total_bookings',
  'response_time_hours',
  'available_slots',
  'max_concurrent_orders',
])

/**
 * Ordered list of known attribute keys for the Additional Details section.
 * Keys appearing here are displayed first, in this order.
 * Unknown keys are appended alphabetically after these.
 */
export const ATTRIBUTE_GROUP_ORDER: string[] = [
  'website_url',
  'headquarters',
  'geographic_reach',
  'founded_year',
  'company_size',
  'company_history',
  'industry_focus',
  'target_audience',
  'delivery_method',
  'support_level',
  'api_available',
  'free_trial',
  'setup_time',
  'contract_length',
  'payment_terms',
  'warranty_period',
  'return_policy',
  'min_order_value',
]

/** Check whether a string value looks like a URL. */
export function isURL(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

/**
 * Convert a snake_case attribute key to a human-readable label.
 * Uses ATTRIBUTE_LABELS for known keys, otherwise title-cases the key.
 */
export function formatAttributeLabel(key: string): string {
  if (ATTRIBUTE_LABELS[key]) return ATTRIBUTE_LABELS[key]
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Safely normalize listing.attributes to a Record, parsing JSON strings.
 * Prevents Object.entries() from iterating character-by-character when
 * attributes arrives as a string.
 *
 * @param attributes - Raw attributes from marketplace_listings (object, string, or null/undefined)
 * @returns Normalized Record, never a string. Record<string, any> for JSX compatibility.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON from DB has no schema; any needed for JSX
export function safeParseAttributes(attributes: unknown): Record<string, any> {
  if (!attributes) return {}
  if (typeof attributes === 'string') {
    try {
      return JSON.parse(attributes) as Record<string, any>
    } catch {
      return {}
    }
  }
  if (typeof attributes === 'object' && !Array.isArray(attributes)) {
    return attributes as Record<string, any>
  }
  return {}
}

/**
 * Safely coerce a value to string[], handling JSON strings and CSV.
 * Prevents .map() crashes when DB returns a string instead of an array.
 *
 * @param value - Raw value (array, JSON string, CSV string, or other)
 * @returns Normalized string[]
 */
export function safeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed.map(String)
    } catch {
      /* not JSON */
    }
    return value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return []
}

// ─── Region Filter ───────────────────────────────────────────────────────────

export type MarketplaceRegion = 'All Regions' | 'UK' | 'Europe' | 'Global'

export const REGION_OPTIONS: MarketplaceRegion[] = ['All Regions', 'UK', 'Europe', 'Global']

const UK_KEYWORDS = [
  'uk', 'united kingdom', 'england', 'scotland', 'wales', 'northern ireland',
  'london', 'manchester', 'birmingham', 'leeds', 'glasgow', 'edinburgh',
  'bristol', 'liverpool', 'sheffield', 'newcastle', 'nottingham', 'cardiff',
  'belfast', 'cambridge', 'oxford', 'coventry', 'leicester', 'southampton',
]

const EUROPE_KEYWORDS = [
  'europe', 'eu', 'european', 'germany', 'france', 'spain', 'italy',
  'netherlands', 'belgium', 'sweden', 'denmark', 'norway', 'finland',
  'poland', 'austria', 'switzerland', 'portugal', 'ireland', 'czech',
  'berlin', 'paris', 'amsterdam', 'munich', 'barcelona', 'rome', 'madrid',
  'dublin', 'vienna', 'zurich', 'stockholm', 'copenhagen', 'oslo', 'helsinki',
]

const GLOBAL_KEYWORDS = [
  'global', 'worldwide', 'international', 'remote', 'anywhere',
  'usa', 'us', 'united states', 'canada', 'australia', 'asia',
  'india', 'china', 'japan', 'singapore', 'new york', 'san francisco',
  'toronto', 'sydney', 'tokyo',
]

/**
 * Derive a geographic region from listing attributes.
 * Checks `location`, `headquarters`, and `geographic_reach` fields
 * using keyword matching.
 *
 * @returns 'UK' | 'Europe' | 'Global' | null (null = could not determine)
 */
export function deriveRegion(attrs: Record<string, unknown>): Exclude<MarketplaceRegion, 'All Regions'> | null {
  const haystack = [
    attrs.location,
    attrs.headquarters,
    attrs.geographic_reach,
  ]
    .filter(Boolean)
    .map((v) => String(v).toLowerCase())
    .join(' ')

  if (!haystack) return null

  // Check UK first (most specific)
  if (UK_KEYWORDS.some((kw) => haystack.includes(kw))) return 'UK'
  if (EUROPE_KEYWORDS.some((kw) => haystack.includes(kw))) return 'Europe'
  if (GLOBAL_KEYWORDS.some((kw) => haystack.includes(kw))) return 'Global'

  return null
}
