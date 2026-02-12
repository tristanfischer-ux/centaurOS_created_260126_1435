/**
 * @file foundry.ts
 * 
 * @description Types related to foundry (company) data including purpose, mission, and vision.
 */

/**
 * Questionnaire responses used to generate purpose statement
 */
export interface PurposeQuestionnaire {
  /** Why does your company exist? Core reason for existence. */
  whyExists: string
  /** What problem are you solving? */
  problemSolved: string
  /** Who do you serve? Target audience. */
  whoServed: string
  /** What makes your approach unique? */
  uniqueValue: string
  /** What does success look like in 5 years? */
  fiveYearVision: string
}

/**
 * Foundry purpose data stored in foundries.purpose_data JSONB column
 */
export interface FoundryPurposeData {
  // Synthesized statements (displayed to users)
  /** The core "why" - 1-2 sentences explaining why the company exists */
  purpose: string
  /** What we do and for whom */
  mission: string | null
  /** Where we're headed (future state) */
  vision: string | null
  
  // Questionnaire responses (used to generate above)
  /** Raw questionnaire responses */
  questionnaire: PurposeQuestionnaire | null
  
  // Metadata
  /** ISO timestamp of last update */
  updatedAt: string
  /** User ID who last edited */
  updatedBy: string
}

/**
 * Partial update type for foundry purpose (used in server actions)
 */
export type UpdateFoundryPurposeData = Partial<Omit<FoundryPurposeData, 'updatedAt' | 'updatedBy'>>

// --- Sector (for CAD Lab component filtering) ---

/** Standardised industry sector used for CAD component library filtering */
export type Sector =
  | 'aerospace'
  | 'agriculture'
  | 'automotive'
  | 'construction'
  | 'consumer_electronics'
  | 'defence'
  | 'energy'
  | 'food_processing'
  | 'logistics'
  | 'manufacturing'
  | 'marine'
  | 'medical'
  | 'mining'
  | 'robotics'
  | 'other'

/** Display labels for sector dropdown */
export const SECTOR_LABELS: Record<Sector, string> = {
  aerospace: 'Aerospace & Space',
  agriculture: 'Agriculture & Farming',
  automotive: 'Automotive',
  construction: 'Construction & Architecture',
  consumer_electronics: 'Consumer Electronics & IoT',
  defence: 'Defence & Security',
  energy: 'Energy & Renewables',
  food_processing: 'Food Processing & Biotech',
  logistics: 'Logistics & Warehousing',
  manufacturing: 'General Manufacturing',
  marine: 'Marine & Subsea',
  medical: 'Medical & Healthcare',
  mining: 'Mining & Extraction',
  robotics: 'Robotics & Drones',
  other: 'Other',
}

/**
 * Maps each sector to the Tier 3 domain component categories it should include.
 * Tier 1 (universal) and Tier 2 (electromechanical) are always included.
 * Only Tier 3 (domain) components are filtered by sector.
 */
export const SECTOR_COMPONENT_DOMAINS: Record<Sector, string[]> = {
  aerospace: ['cubesat', 'drone'],
  agriculture: ['vertical_farming', 'bsf_breeding'],
  automotive: [],
  construction: ['eps_architectural'],
  consumer_electronics: [],
  defence: ['drone', 'cubesat'],
  energy: ['brine_mining'],
  food_processing: ['bsf_breeding', 'vertical_farming'],
  logistics: [],
  manufacturing: [],
  marine: ['brine_mining'],
  medical: [],
  mining: ['brine_mining'],
  robotics: ['drone'],
  other: [],
}

// --- Company Profile ---

/** How many employees the company has */
export type EmployeeCount = 'just_me' | '2-5' | '6-15' | '16-50' | '51-200' | '200+'

/** Annual revenue range */
export type RevenueRange = 'pre_revenue' | 'under_100k' | '100k_500k' | '500k_1m' | '1m_5m' | '5m_plus'

/** Current funding status */
export type FundingStatus = 'bootstrapped' | 'pre_seed' | 'seed' | 'series_a' | 'series_b_plus' | 'profitable'

/** Primary business model */
export type BusinessModel = 'saas' | 'marketplace' | 'services' | 'hardware' | 'hybrid' | 'other'

/**
 * Structured company profile stored in foundries.company_profile JSONB column.
 * Used by the AI Context Builder to personalise recommendations.
 */
export interface CompanyProfile {
  /** Company size */
  employee_count: EmployeeCount | null
  /** Annual revenue bracket */
  revenue_range: RevenueRange | null
  /** Current funding stage */
  funding_status: FundingStatus | null
  /** Whether the company is actively seeking funding */
  seeking_funding: boolean | null
  /** Year the company was founded */
  founded_year: number | null
  /** City / country */
  location: string | null
  /** Company website URL */
  website: string | null
  /** Primary business model */
  business_model: BusinessModel | null

  // Metadata
  /** ISO timestamp of last update */
  updatedAt: string
  /** User ID who last edited */
  updatedBy: string
}

/** Display labels for enum values */
export const EMPLOYEE_COUNT_LABELS: Record<EmployeeCount, string> = {
  just_me: 'Just me',
  '2-5': '2–5',
  '6-15': '6–15',
  '16-50': '16–50',
  '51-200': '51–200',
  '200+': '200+',
}

export const REVENUE_RANGE_LABELS: Record<RevenueRange, string> = {
  pre_revenue: 'Pre-revenue',
  under_100k: 'Under £100k',
  '100k_500k': '£100k – £500k',
  '500k_1m': '£500k – £1m',
  '1m_5m': '£1m – £5m',
  '5m_plus': '£5m+',
}

export const FUNDING_STATUS_LABELS: Record<FundingStatus, string> = {
  bootstrapped: 'Bootstrapped',
  pre_seed: 'Pre-seed',
  seed: 'Seed',
  series_a: 'Series A',
  series_b_plus: 'Series B+',
  profitable: 'Profitable',
}

export const BUSINESS_MODEL_LABELS: Record<BusinessModel, string> = {
  saas: 'SaaS',
  marketplace: 'Marketplace',
  services: 'Services',
  hardware: 'Hardware',
  hybrid: 'Hybrid',
  other: 'Other',
}
