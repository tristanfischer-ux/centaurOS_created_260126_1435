// Apprenticeship types - exported from separate file to avoid 'use server' restrictions

// =============================================
// DOCUMENT TYPES
// =============================================

export type DocumentType = 
  | 'apprenticeship_agreement'
  | 'commitment_statement'
  | 'training_plan'
  | 'progress_review'
  | 'evidence_portfolio'
  | 'gateway_declaration'
  | 'epa_submission'
  | 'certificate'
  | 'other'

export interface Signature {
  user_id: string
  role: string
  signed_at: string
  ip_address?: string
  full_name?: string
}

export interface RequiredSignature {
  user_id: string
  role: string
  full_name?: string
}

export interface ApprenticeshipDocument {
  id: string
  enrollment_id: string
  document_type: DocumentType
  title: string
  description: string | null
  file_url: string | null
  content: Record<string, unknown> | null
  template_version: string | null
  signatures: Signature[]
  requires_signatures: RequiredSignature[]
  status: 'draft' | 'pending_signatures' | 'partially_signed' | 'signed' | 'expired' | 'superseded'
  valid_from: string | null
  valid_until: string | null
  created_at: string
  updated_at: string
}

export const DOCUMENT_TYPE_INFO: Record<DocumentType, { label: string; description: string; icon: string }> = {
  apprenticeship_agreement: {
    label: 'Apprenticeship Agreement',
    description: 'Employment contract between apprentice and employer',
    icon: 'FileSignature'
  },
  commitment_statement: {
    label: 'Commitment Statement',
    description: 'Three-way agreement between apprentice, employer, and training provider',
    icon: 'FileCheck'
  },
  training_plan: {
    label: 'Individual Training Plan',
    description: 'Personalized plan outlining learning journey and milestones',
    icon: 'BookOpen'
  },
  progress_review: {
    label: 'Progress Review Record',
    description: 'Formal record of progress review meeting',
    icon: 'ClipboardList'
  },
  evidence_portfolio: {
    label: 'Evidence Portfolio',
    description: 'Collection of work evidence for assessment',
    icon: 'FolderOpen'
  },
  gateway_declaration: {
    label: 'Gateway Declaration',
    description: 'Formal declaration of readiness for EPA',
    icon: 'Shield'
  },
  epa_submission: {
    label: 'EPA Submission',
    description: 'End-Point Assessment submission documents',
    icon: 'Award'
  },
  certificate: {
    label: 'Certificate',
    description: 'Apprenticeship completion certificate',
    icon: 'GraduationCap'
  },
  other: {
    label: 'Other Document',
    description: 'Supporting documentation',
    icon: 'File'
  }
}

// =============================================
// ENROLLMENT TYPES
// =============================================

export interface EnrollmentInput {
  apprenticeId: string
  programmeId: string
  foundryId: string
  startDate: string
  workplaceBuddyId?: string
  seniorMentorId?: string
  hourlyRate?: number
  wageBand?: 'apprentice_minimum' | 'national_minimum' | 'living_wage' | 'above_living_wage'
  employmentType?: 'full_time' | 'part_time'
  weeklyHours?: number
}

export interface Enrollment {
  id: string
  apprentice_id: string
  programme_id: string
  foundry_id: string
  start_date: string
  expected_end_date: string
  flying_start_date: string
  status: string
  otjt_hours_logged: number
  otjt_hours_target: number
  workplace_buddy_id: string | null
  senior_mentor_id: string | null
  agreement_signed_at: string | null
  commitment_statement_signed_at: string | null
  training_plan_approved_at: string | null
  apprentice?: {
    id: string
    full_name: string
    email: string
    avatar_url: string | null
  }
  programme?: {
    id: string
    title: string
    level: number
    standard_code: string
    duration_months: number
    skills_framework: Record<string, string[]>
  }
  workplace_buddy?: {
    id: string
    full_name: string
    avatar_url: string | null
  }
  senior_mentor?: {
    id: string
    full_name: string
    avatar_url: string | null
  }
}

// =============================================
// PROGRESS REVIEW TYPES
// =============================================

export interface ProgressReviewInput {
  enrollmentId: string
  reviewType: 'weekly' | 'monthly' | 'quarterly' | 'mid_programme' | 'gateway' | 'end_point_assessment'
  scheduledDate?: string
  objectivesMet?: string[]
  skillsDemonstrated?: string[]
  areasForImprovement?: string[]
  apprenticeReflection?: string
  mentorFeedback?: string
  actionItems?: string[]
  overallRating?: number
  onTrack?: boolean
  gatewayReady?: boolean
  epaRecommendation?: string
  durationMinutes?: number
}

export interface SkillAssessmentInput {
  enrollmentId: string
  skillId: string
  currentLevel: number
  assessmentMethod?: 'observation' | 'portfolio' | 'test' | 'self_assessment'
  evidence?: string
  assessorNotes?: string
  developmentPlan?: string
}

// =============================================
// OTJT TRACKING TYPES
// =============================================

export type ActivityType = 
  | 'learning_module'
  | 'mentoring'
  | 'workshop'
  | 'self_study'
  | 'project_training'
  | 'assessment'
  | 'shadowing'
  | 'external_training'
  | 'other'

export interface OTJTLogInput {
  enrollmentId: string
  logDate: string
  hours: number
  activityType: ActivityType
  description?: string
  learningOutcomes?: string
  moduleId?: string
  taskId?: string
  evidenceUrl?: string
}

export interface OTJTLog {
  id: string
  enrollment_id: string
  log_date: string
  hours: number
  activity_type: ActivityType
  description: string | null
  learning_outcomes: string | null
  module_id: string | null
  task_id: string | null
  status: 'pending' | 'approved' | 'rejected' | 'queried'
  approved_by: string | null
  approved_at: string | null
  rejection_reason: string | null
  query_message: string | null
  evidence_url: string | null
  created_at: string
  module?: {
    title: string
  }
  task?: {
    title: string
  }
  approver?: {
    full_name: string
  }
}

export interface WeeklySummary {
  logs: OTJTLog[]
  totalHours: number
  approvedHours: number
  pendingHours: number
  rejectedHours: number
  targetWeeklyHours: number
  onTrack: boolean
  shortfall: number
  weekStartDate: string
  weekEndDate: string
}

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, { label: string; description: string }> = {
  learning_module: {
    label: 'Learning Module',
    description: 'Completing online training modules or courses'
  },
  mentoring: {
    label: 'Mentoring Session',
    description: '1:1 time with your mentor or workplace buddy'
  },
  workshop: {
    label: 'Workshop/Training',
    description: 'Group training sessions or workshops'
  },
  self_study: {
    label: 'Self-Study',
    description: 'Independent learning (reading, research, practice)'
  },
  project_training: {
    label: 'Project-Based Learning',
    description: 'Learning new skills through project work'
  },
  assessment: {
    label: 'Assessment',
    description: 'Taking tests, quizzes, or formal assessments'
  },
  shadowing: {
    label: 'Job Shadowing',
    description: 'Observing experienced colleagues at work'
  },
  external_training: {
    label: 'External Training',
    description: 'External courses, conferences, or certifications'
  },
  other: {
    label: 'Other',
    description: 'Other qualifying off-the-job training'
  }
}
