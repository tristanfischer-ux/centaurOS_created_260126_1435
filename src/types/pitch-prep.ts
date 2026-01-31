/**
 * Pitch Preparation Types
 * Types for the pitch preparation service in the marketplace
 * 
 * LEGAL NOTE: This is a preparation service only. CentaurOS does not
 * provide investment advice or facilitate securities transactions.
 * All investment discussions happen directly between parties off-platform.
 */

// =============================================
// ENUMS & CONSTANTS
// =============================================

/** Company funding stage */
export type FundingStage = 
  | 'Pre-Seed'
  | 'Seed'
  | 'Series A'
  | 'Series B+'
  | 'Growth'
  | 'Bridge'

/** Company legal structure */
export type LegalStructure = 
  | 'Ltd'
  | 'Inc'
  | 'LLC'
  | 'GmbH'
  | 'PLC'
  | 'Other'

/** Types of pitch prep services */
export type PitchPrepServiceType =
  | 'Pitch Deck Design'
  | 'Pitch Coaching'
  | 'Narrative Development'
  | 'Financial Modeling'
  | 'Data Room Setup'
  | 'Full Package'

/** Target investor types (informational only) */
export type InvestorType =
  | 'Angel'
  | 'VC'
  | 'Corporate VC'
  | 'Family Office'
  | 'Crowdfunding'
  | 'Grant'

/** Request status */
export type PitchPrepStatus = 
  | 'draft'
  | 'submitted'
  | 'in_review'
  | 'matched'
  | 'in_progress'
  | 'completed'
  | 'cancelled'

// =============================================
// CORE TYPES
// =============================================

/** Team member information */
export interface TeamMemberInfo {
  name: string
  role: string
  linkedIn?: string
  background?: string
}

/** Pitch preparation request */
export interface PitchPrepRequest {
  id: string
  foundry_id: string
  user_id: string
  
  // Company Information
  company_name: string
  company_website?: string | null
  founding_date?: string | null
  legal_structure?: LegalStructure | null
  headquarters?: string | null
  
  // Team
  founder_count?: number | null
  team_size?: number | null
  key_team_members?: TeamMemberInfo[] | null
  
  // Product & Market
  product_description: string
  problem_solved?: string | null
  target_market?: string | null
  competitive_landscape?: string | null
  
  // Traction (informational)
  stage: FundingStage
  has_revenue: boolean
  traction_summary?: string | null
  
  // Fundraising Context (informational only - NOT investment terms)
  amount_seeking?: string | null  // e.g., "£500K-£1M"
  use_of_funds?: string | null
  timeline?: string | null
  
  // Services Requested
  services_requested: PitchPrepServiceType[]
  target_investor_types?: InvestorType[] | null
  specific_questions?: string | null
  
  // Files
  pitch_deck_url?: string | null
  financial_model_url?: string | null
  additional_files?: string[] | null
  
  // Status
  status: PitchPrepStatus
  matched_provider_id?: string | null
  
  // Metadata
  created_at: string
  updated_at: string
}

/** Pitch prep request with user profile */
export interface PitchPrepRequestWithUser extends PitchPrepRequest {
  user: {
    id: string
    full_name: string | null
    email: string
    avatar_url: string | null
  } | null
}

// =============================================
// CREATE/UPDATE PARAMS
// =============================================

/** Parameters for creating a pitch prep request */
export interface CreatePitchPrepParams {
  // Required
  company_name: string
  product_description: string
  stage: FundingStage
  has_revenue: boolean
  services_requested: PitchPrepServiceType[]
  
  // Optional company info
  company_website?: string
  founding_date?: string
  legal_structure?: LegalStructure
  headquarters?: string
  
  // Optional team info
  founder_count?: number
  team_size?: number
  key_team_members?: TeamMemberInfo[]
  
  // Optional market info
  problem_solved?: string
  target_market?: string
  competitive_landscape?: string
  
  // Optional traction
  traction_summary?: string
  
  // Optional fundraising context (informational)
  amount_seeking?: string
  use_of_funds?: string
  timeline?: string
  
  // Optional preferences
  target_investor_types?: InvestorType[]
  specific_questions?: string
  
  // Files
  pitch_deck_url?: string
  financial_model_url?: string
  additional_files?: string[]
}

/** Parameters for updating a pitch prep request */
export interface UpdatePitchPrepParams extends Partial<CreatePitchPrepParams> {
  status?: PitchPrepStatus
}

// =============================================
// CONSTANTS
// =============================================

/** Available funding stages */
export const FUNDING_STAGES: FundingStage[] = [
  'Pre-Seed',
  'Seed',
  'Series A',
  'Series B+',
  'Growth',
  'Bridge',
]

/** Available legal structures */
export const LEGAL_STRUCTURES: LegalStructure[] = [
  'Ltd',
  'Inc',
  'LLC',
  'GmbH',
  'PLC',
  'Other',
]

/** Available pitch prep services */
export const PITCH_PREP_SERVICES: PitchPrepServiceType[] = [
  'Pitch Deck Design',
  'Pitch Coaching',
  'Narrative Development',
  'Financial Modeling',
  'Data Room Setup',
  'Full Package',
]

/** Target investor types */
export const INVESTOR_TYPES: InvestorType[] = [
  'Angel',
  'VC',
  'Corporate VC',
  'Family Office',
  'Crowdfunding',
  'Grant',
]

/** Service descriptions for UI */
export const PITCH_PREP_SERVICE_DESCRIPTIONS: Record<PitchPrepServiceType, string> = {
  'Pitch Deck Design': 'Professional pitch deck design and visual storytelling',
  'Pitch Coaching': 'One-on-one coaching sessions to refine your pitch delivery',
  'Narrative Development': 'Craft your investment story and positioning',
  'Financial Modeling': 'Investor-grade financial models and projections',
  'Data Room Setup': 'Organize documents for due diligence readiness',
  'Full Package': 'Comprehensive preparation across all areas',
}
