// Helper type for joined tasks since we can't fully regen types
import { Database } from "@/types/database.types"

export type TaskWithAssignee = Database["public"]["Tables"]["tasks"]["Row"] & {
    assignee?: {
        id: string
        full_name: string | null
        role: Database["public"]["Enums"]["member_role"]
        email: string
    } | null
}
