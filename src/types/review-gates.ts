/**
 * Types for Review Gates, Sector Skills, and RFQ Templates
 * Human-in-the-loop review system for tasks and objectives
 */

// ============================================================================
// REVIEW GATES
// ============================================================================

export type ReviewGateType =
  | 'expert_review'
  | 'peer_review'
  | 'quality_gate'
  | 'safety_review'
  | 'manufacturing_review'
  | 'compliance_review'

export type ReviewGateStatus = 'pending' | 'in_review' | 'approved' | 'rejected' | 'waived'

export interface ReviewGate {
  id: string
  foundry_id: string
  task_id: string | null
  objective_id: string | null
  gate_type: ReviewGateType
  title: string
  description: string | null
  required_skills: string[]
  sector: string | null
  reviewer_id: string | null
  status: ReviewGateStatus
  review_notes: string | null
  reviewed_at: string | null
  created_by: string | null
  created_at: string

  // Joined data (optional)
  reviewer?: {
    id: string
    full_name: string | null
    avatar_url?: string | null
    role?: string
  }
  created_by_profile?: {
    id: string
    full_name: string | null
  }
}

export interface CreateReviewGateInput {
  task_id?: string
  objective_id?: string
  gate_type: ReviewGateType
  title: string
  description?: string
  required_skills?: string[]
  sector?: string
  reviewer_id?: string
}

export interface SubmitReviewInput {
  gate_id: string
  status: 'approved' | 'rejected' | 'waived'
  review_notes?: string
}

// Review gate type display configuration
export const REVIEW_GATE_TYPES: {
  value: ReviewGateType
  label: string
  description: string
  icon: string
  color: string
}[] = [
  {
    value: 'expert_review',
    label: 'Expert Review',
    description: 'Requires a domain expert to review and approve',
    icon: 'UserCheck',
    color: 'text-chart-5',
  },
  {
    value: 'peer_review',
    label: 'Peer Review',
    description: 'Requires a team member to review the work',
    icon: 'Users',
    color: 'text-status-info',
  },
  {
    value: 'quality_gate',
    label: 'Quality Gate',
    description: 'Quality checkpoint requiring sign-off before proceeding',
    icon: 'ShieldCheck',
    color: 'text-status-success',
  },
  {
    value: 'safety_review',
    label: 'Safety Review',
    description: 'Safety-critical review requiring qualified reviewer',
    icon: 'ShieldAlert',
    color: 'text-destructive',
  },
  {
    value: 'manufacturing_review',
    label: 'Manufacturing Review',
    description: 'Manufacturing process review (DFM, quality, readiness)',
    icon: 'Factory',
    color: 'text-status-warning',
  },
  {
    value: 'compliance_review',
    label: 'Compliance Review',
    description: 'Regulatory or compliance review before approval',
    icon: 'FileCheck',
    color: 'text-chart-2',
  },
]

export const REVIEW_GATE_STATUS_LABELS: Record<ReviewGateStatus, { label: string; color: string }> = {
  pending: { label: 'Pending Review', color: 'text-muted-foreground' },
  in_review: { label: 'In Review', color: 'text-status-info' },
  approved: { label: 'Approved', color: 'text-status-success' },
  rejected: { label: 'Rejected', color: 'text-destructive' },
  waived: { label: 'Waived', color: 'text-muted-foreground' },
}

// ============================================================================
// SECTOR SKILLS
// ============================================================================

export type SkillCategory =
  | 'engineering'
  | 'manufacturing'
  | 'regulatory'
  | 'business'
  | 'software'
  | 'operations'

export interface SectorSkill {
  id: string
  sector: string
  skill_name: string
  skill_category: SkillCategory
  is_expert_level: boolean
}

export const SECTORS = [
  'robotics',
  'rockets',
  'satellites',
  'consumer-electronics',
  'pharmaceuticals',
  'ai-datacentre',
  'saas',
  'mobile',
] as const

export type Sector = (typeof SECTORS)[number]

export const SECTOR_LABELS: Record<Sector, string> = {
  robotics: 'Robotics & Automation',
  rockets: 'Rockets & Launch Vehicles',
  satellites: 'Satellites & Space Systems',
  'consumer-electronics': 'Consumer Electronics',
  pharmaceuticals: 'Pharmaceuticals',
  'ai-datacentre': 'AI Infrastructure & Compute',
  saas: 'SaaS',
  mobile: 'Mobile Apps',
}

export const SKILL_CATEGORY_LABELS: Record<SkillCategory, string> = {
  engineering: 'Engineering',
  manufacturing: 'Manufacturing',
  regulatory: 'Regulatory & Compliance',
  business: 'Business',
  software: 'Software',
  operations: 'Operations',
}

// ============================================================================
// RFQ TEMPLATES
// ============================================================================

export interface RFQTemplate {
  id: string
  title: string
  sector: string | null
  rfq_type: string
  category: string | null
  default_specifications: Record<string, unknown>
  description: string | null
  is_manufacturing: boolean
  display_order: number
}
