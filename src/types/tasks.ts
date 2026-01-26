// Helper type for joined tasks since we can't fully regen types
import { Database } from "@/types/database.types"

type Profile = {
    id: string
    full_name: string | null
    role: Database["public"]["Enums"]["member_role"]
    email: string
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
