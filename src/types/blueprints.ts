/**
 * Types for Blueprints Feature
 * Knowledge domain mapping for products, ventures, and projects
 */

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

export type CoverageStatus = 'covered' | 'partial' | 'gap' | 'not_needed'

export type ExpertiseLevel = 'expert' | 'competent' | 'learning'

export type PersonType = 'team' | 'advisor' | 'marketplace' | 'external' | 'ai_agent'

export type VerificationStatus = 'verified' | 'claimed' | 'inferred'

export type ProjectStage = 'concept' | 'prototype' | 'evt' | 'dvt' | 'production' | 'launched'

export type ProjectType = 'product' | 'venture' | 'project'

export type DomainCriticality = 'critical' | 'important' | 'nice-to-have'

export type DomainCategory = 
  | 'Electronics'
  | 'Mechanical'
  | 'Software'
  | 'Manufacturing'
  | 'Regulatory'
  | 'Business'
  | 'Operations'

export type SupplierType = 
  | 'manufacturer'
  | 'distributor'
  | 'service'
  | 'contract_mfg'
  | 'component'
  | 'testing_lab'

export type SupplierStatus = 'evaluating' | 'active' | 'backup' | 'inactive'

export type MilestoneStatus = 'upcoming' | 'in_progress' | 'complete' | 'blocked'

// Project stages with display info
export const PROJECT_STAGES: { value: ProjectStage; label: string; description: string }[] = [
  { value: 'concept', label: 'Concept', description: 'Early research and feasibility' },
  { value: 'prototype', label: 'Prototype', description: 'Building first working prototype' },
  { value: 'evt', label: 'EVT', description: 'Engineering Validation Testing' },
  { value: 'dvt', label: 'DVT', description: 'Design Validation Testing' },
  { value: 'production', label: 'Production', description: 'Manufacturing ramp' },
  { value: 'launched', label: 'Launched', description: 'Product in market' },
]

// Domain categories with colors
export const DOMAIN_CATEGORY_COLORS: Record<DomainCategory, { bg: string; text: string; border: string }> = {
  Electronics: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  Mechanical: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  Software: { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200' },
  Manufacturing: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  Regulatory: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
  Business: { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200' },
  Operations: { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' },
}

// Coverage status colors
export const COVERAGE_STATUS_COLORS: Record<CoverageStatus, { bg: string; text: string; border: string; dot: string }> = {
  covered: { bg: 'bg-status-success-light', text: 'text-status-success', border: 'border-status-success', dot: 'bg-status-success' },
  partial: { bg: 'bg-status-warning-light', text: 'text-status-warning', border: 'border-status-warning', dot: 'bg-status-warning' },
  gap: { bg: 'bg-status-error-light', text: 'text-destructive', border: 'border-destructive', dot: 'bg-destructive' },
  not_needed: { bg: 'bg-muted', text: 'text-muted-foreground', border: 'border-muted', dot: 'bg-muted-foreground' },
}

// ============================================================================
// BLUEPRINT TEMPLATES
// ============================================================================

export interface BlueprintTemplate {
  id: string
  name: string
  description: string | null
  product_category: string
  icon: string
  estimated_domains: number
  estimated_questions: number
  is_system_template: boolean
  created_by: string | null
  fork_count: number
  use_count: number
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

// ============================================================================
// KNOWLEDGE DOMAINS
// ============================================================================

export interface KeyQuestion {
  id: string
  question: string
  context?: string
  difficulty?: 'basic' | 'intermediate' | 'advanced'
}

export interface LearningResource {
  type: 'course' | 'book' | 'article' | 'video' | 'community' | 'tool'
  title: string
  url?: string
  description?: string
}

export interface KnowledgeDomain {
  id: string
  template_id: string
  parent_id: string | null
  name: string
  description: string | null
  category: DomainCategory | null
  depth: number
  display_order: number
  key_questions: KeyQuestion[]
  typical_roles: string[]
  related_domain_ids: string[]
  prerequisite_domain_ids: string[]
  learning_resources: {
    courses?: LearningResource[]
    books?: LearningResource[]
    articles?: LearningResource[]
    communities?: LearningResource[]
    tools?: LearningResource[]
  }
  marketplace_categories: string[]
  supplier_categories: string[]
  criticality: DomainCriticality
  learning_time_estimate: string | null
  ai_summary: string | null
  created_at: string
  
  // Computed fields (not in DB)
  children?: KnowledgeDomain[]
}

// Hierarchical domain tree node
export interface DomainTreeNode extends KnowledgeDomain {
  children: DomainTreeNode[]
  path: string // "Electronics > Power Systems > Battery Management"
}

// ============================================================================
// BLUEPRINTS
// ============================================================================

export interface Blueprint {
  id: string
  foundry_id: string
  template_id: string | null
  name: string
  description: string | null
  project_type: ProjectType
  project_stage: ProjectStage
  ai_generated_context: {
    original_description?: string
    inferred_domains?: string[]
    suggested_suppliers?: string[]
    risk_assessment?: string
  }
  coverage_score: number
  critical_gaps: number
  total_domains: number
  covered_domains: number
  settings: {
    show_all_domains?: boolean
    collapsed_categories?: string[]
  }
  status: 'active' | 'archived' | 'template'
  created_by: string | null
  created_at: string
  updated_at: string
  
  // Joined data (optional)
  template?: BlueprintTemplate
  domain_coverage?: DomainCoverage[]
  suppliers?: BlueprintSupplier[]
  milestones?: BlueprintMilestone[]
}

// ============================================================================
// DOMAIN COVERAGE
// ============================================================================

export interface DomainCoverage {
  id: string
  blueprint_id: string
  domain_id: string
  domain_path: string | null
  domain_name: string | null
  status: CoverageStatus
  is_critical: boolean
  notes: string | null
  blockers: string[]
  decisions: {
    decision: string
    made_at: string
    made_by?: string
  }[]
  questions_answered: {
    question_id: string
    answer: string
    answered_at: string
    answered_by?: string
  }[]
  questions_open: string[]
  updated_at: string
  
  // Joined data (optional)
  domain?: KnowledgeDomain
  expertise?: Expertise[]
}

// Full coverage with all joined data
export interface DomainCoverageWithDetails extends DomainCoverage {
  domain: KnowledgeDomain
  expertise: Expertise[]
}

// ============================================================================
// EXPERTISE
// ============================================================================

export interface ExternalContact {
  name: string
  email?: string
  company?: string
  linkedin?: string
  phone?: string
  notes?: string
}

export interface Availability {
  status: 'available' | 'limited' | 'unavailable'
  hours_per_week?: number
  response_time?: string
  notes?: string
}

export interface Expertise {
  id: string
  coverage_id: string
  person_type: PersonType
  profile_id: string | null
  marketplace_listing_id: string | null
  external_contact: ExternalContact | null
  expertise_level: ExpertiseLevel | null
  confidence: number | null
  verification_status: VerificationStatus
  specific_skills: string[]
  availability: Availability | null
  notes: string | null
  created_at: string
  
  // Joined data (optional)
  profile?: {
    id: string
    full_name: string
    email: string
    avatar_url?: string
    role?: string
  }
  marketplace_listing?: {
    id: string
    title: string
    price?: number
  }
}

// ============================================================================
// SUPPLIERS
// ============================================================================

export interface SupplierCapabilities {
  min_order_qty?: number
  lead_time?: string
  certifications?: string[]
  industries?: string[]
  geographies?: string[]
}

export interface SupplierCompanyInfo {
  headquarters?: string
  founded?: number
  employees?: string
  revenue?: string
  publicly_traded?: boolean
  ticker?: string
}

export interface SupplierContact {
  sales_email?: string
  sales_phone?: string
  technical_email?: string
  website?: string
}

export interface Supplier {
  id: string
  name: string
  description: string | null
  website: string | null
  logo_url: string | null
  supplier_type: SupplierType
  domain_categories: string[]
  capabilities: SupplierCapabilities
  company_info: SupplierCompanyInfo
  contact: SupplierContact
  verification_status: 'verified' | 'unverified' | 'community_verified'
  verified_at: string | null
  verified_by: string | null
  community_rating: number | null
  review_count: number
  used_by_count: number
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface SupplierReview {
  id: string
  supplier_id: string
  foundry_id: string
  reviewer_id: string
  rating: number
  title: string | null
  content: string | null
  pros: string[]
  cons: string[]
  would_recommend: boolean | null
  project_type: string | null
  order_value_range: string | null
  verified_purchase: boolean
  created_at: string
  
  // Joined data
  reviewer?: {
    id: string
    full_name: string
    avatar_url?: string
  }
}

export interface BlueprintSupplier {
  id: string
  blueprint_id: string
  supplier_id: string
  role: string | null
  status: SupplierStatus
  domain_categories: string[]
  notes: string | null
  contact_history: {
    date: string
    type: string
    notes: string
  }[]
  quotes: {
    date: string
    amount: number
    currency: string
    valid_until?: string
    notes?: string
  }[]
  created_at: string
  
  // Joined data
  supplier?: Supplier
}

// ============================================================================
// MILESTONES
// ============================================================================

export interface BlueprintMilestone {
  id: string
  blueprint_id: string
  name: string
  description: string | null
  target_date: string | null
  required_domain_ids: string[]
  status: MilestoneStatus
  completed_at: string | null
  display_order: number
  created_at: string
  
  // Computed
  blocking_gaps?: DomainCoverage[]
}

// ============================================================================
// HISTORY
// ============================================================================

export interface BlueprintHistoryEntry {
  id: string
  blueprint_id: string
  action: string
  details: Record<string, unknown>
  user_id: string | null
  created_at: string
  
  // Joined
  user?: {
    id: string
    full_name: string
    avatar_url?: string
  }
}

// ============================================================================
// SUMMARY & METRICS
// ============================================================================

export interface BlueprintSummary {
  total_domains: number
  covered: number
  partial: number
  gaps: number
  not_needed: number
  coverage_percentage: number
  critical_gaps: number
  by_category: {
    category: DomainCategory
    total: number
    covered: number
    gaps: number
    coverage_percentage: number
  }[]
}

export interface CoverageProgress {
  date: string
  coverage_score: number
  covered_domains: number
  total_domains: number
}

// ============================================================================
// INPUT TYPES
// ============================================================================

export interface CreateBlueprintInput {
  name: string
  description?: string
  template_id?: string
  project_type?: ProjectType
  project_stage?: ProjectStage
  
  // For AI-generated blueprints
  ai_description?: string
}

export interface UpdateBlueprintInput {
  name?: string
  description?: string
  project_stage?: ProjectStage
  status?: 'active' | 'archived'
  settings?: Blueprint['settings']
}

export interface UpdateCoverageInput {
  status: CoverageStatus
  notes?: string
  blockers?: string[]
}

export interface AddExpertiseInput {
  coverage_id: string
  person_type: PersonType
  profile_id?: string
  marketplace_listing_id?: string
  external_contact?: ExternalContact
  expertise_level?: ExpertiseLevel
  confidence?: number
  specific_skills?: string[]
  availability?: Availability
  notes?: string
}

export interface AddSupplierInput {
  blueprint_id: string
  supplier_id: string
  role?: string
  status?: SupplierStatus
  domain_categories?: string[]
  notes?: string
}

export interface CreateMilestoneInput {
  blueprint_id: string
  name: string
  description?: string
  target_date?: string
  required_domain_ids?: string[]
}

// ============================================================================
// VIEW MODELS
// ============================================================================

// For the "Next Action" focused view
export interface NextAction {
  type: 'gap' | 'milestone' | 'update'
  priority: 'critical' | 'high' | 'medium' | 'low'
  title: string
  description: string
  domain?: DomainCoverageWithDetails
  milestone?: BlueprintMilestone
  actions: {
    label: string
    action: string
    url?: string
  }[]
}

// For the guided assessment flow
export interface AssessmentQuestion {
  domain_id: string
  domain_name: string
  domain_path: string
  category: DomainCategory | null
  question: string
  context?: string
  is_critical: boolean
}

export interface AssessmentAnswer {
  domain_id: string
  status: CoverageStatus
  covered_by?: {
    type: PersonType
    name: string
    profile_id?: string
  }
  notes?: string
}

// For the domain tree view
export interface DomainTreeViewNode {
  id: string
  name: string
  category: DomainCategory | null
  depth: number
  status: CoverageStatus
  is_critical: boolean
  coverage_count: number
  questions_total: number
  questions_answered: number
  children: DomainTreeViewNode[]
  expanded?: boolean
}
