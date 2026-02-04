// Helper type for joined tasks since we can't fully regen types
import { Database } from "@/types/database.types"

export type Profile = {
    id: string
    full_name: string | null
    avatar_url: string | null
    role: Database["public"]["Enums"]["member_role"]
    email: string
}

// ============================================================================
// TASK METADATA TYPES (for Blueprint Integration)
// ============================================================================

/**
 * Artifact types that can be stored in task metadata
 */
export type TaskArtifactType = 
    | 'expert_packet'
    | 'rfq_pack'
    | 'decision_proposal'
    | 'domain_suggestion'
    | 'risk_assessment'
    | 'option_set'

/**
 * AI provenance type for tracking content origin
 */
export type ProvenanceType = 'template_derived' | 'user_entered' | 'ai_suggested'

/**
 * AI verification status
 */
export type VerificationStatus = 'draft' | 'pending_review' | 'approved' | 'rejected'

/**
 * Provenance metadata for AI-generated content
 */
export interface ProvenanceMetadata {
    type: ProvenanceType
    confidence: number // 0-100
    rationale?: string
    assumptions?: string[]
    model_metadata?: {
        model_id: string
        temperature?: number
        prompt_version?: string
        tokens_used?: number
    }
    source_context?: {
        blueprint_id?: string
        domain_id?: string
        project_stage?: string
        referenced_decisions?: string[]
    }
    verification?: {
        status: VerificationStatus
        reviewed_by?: string
        reviewed_at?: string
        review_notes?: string
    }
}

/**
 * Task metadata schema for blueprint integration
 */
export interface TaskMetadata {
    /** Link to blueprint */
    blueprint_id?: string
    /** Link to domain */
    domain_id?: string
    /** Type of artifact this task represents */
    artifact_type?: TaskArtifactType
    /** AI provenance tracking */
    provenance?: ProvenanceMetadata
    /** Artifact-specific data */
    artifact_data?: Record<string, unknown>
    /** Stage snapshot at task creation */
    stage_snapshot?: string
}

// Legacy single assignee type (for backward compatibility)
export type TaskWithAssignee = Database["public"]["Tables"]["tasks"]["Row"] & {
    assignee?: Profile | null
}

// New multi-assignee type
export type TaskWithAssignees = Database["public"]["Tables"]["tasks"]["Row"] & {
    assignees: Profile[]
    team?: { id: string; name: string; is_auto_generated: boolean } | null
}

// Team types
export type Team = {
    id: string
    name: string
    foundry_id: string
    is_auto_generated: boolean
    created_at: string
    members?: Profile[]
}

export type TeamMember = {
    team_id: string
    profile_id: string
    profile?: Profile
}

// Task thread item for merged message/comment threads
export type TaskThreadItem = {
    id: string
    content: string
    author: Profile
    created_at: string
    source: 'message' | 'comment'
    message_id?: string
    task_id?: string
    conversation_id?: string
}
