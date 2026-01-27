export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export type Database = {
    // Allows to automatically instantiate createClient with right options
    // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
    __InternalSupabase: {
        PostgrestVersion: "14.1"
    }
    public: {
        Tables: {
            ai_tools: {
                Row: {
                    category: string
                    created_at: string | null
                    description: string | null
                    id: string
                    name: string
                    provider: string
                    typical_monthly_cost: number | null
                }
                Insert: {
                    category: string
                    created_at?: string | null
                    description?: string | null
                    id?: string
                    name: string
                    provider: string
                    typical_monthly_cost?: number | null
                }
                Update: {
                    category?: string
                    created_at?: string | null
                    description?: string | null
                    id?: string
                    name?: string
                    provider?: string
                    typical_monthly_cost?: number | null
                }
                Relationships: []
            }
            foundries: {
                Row: {
                    created_at: string | null
                    id: string
                    name: string
                }
                Insert: {
                    created_at?: string | null
                    id: string
                    name: string
                }
                Update: {
                    created_at?: string | null
                    id?: string
                    name?: string
                }
                Relationships: []
            }
            foundry_stack: {
                Row: {
                    created_at: string | null
                    foundry_id: string
                    id: string
                    provider_id: string | null
                    status: string | null
                    tool_id: string | null
                }
                Insert: {
                    created_at?: string | null
                    foundry_id: string
                    id?: string
                    provider_id?: string | null
                    status?: string | null
                    tool_id?: string | null
                }
                Update: {
                    created_at?: string | null
                    foundry_id: string
                    id?: string
                    provider_id?: string | null
                    status?: string | null
                    tool_id?: string | null
                }
                Relationships: []
            }
            members: {
                Row: {
                    email: string
                    full_name: string | null
                    id: string
                    role: string
                    status: string | null
                }
                Insert: {
                    email: string
                    full_name?: string | null
                    id: string
                    role?: string
                    status?: string | null
                }
                Update: {
                    email?: string
                    full_name?: string | null
                    id?: string
                    role?: string
                    status?: string | null
                }
                Relationships: []
            }
            objectives: {
                Row: {
                    created_at: string | null
                    creator_id: string
                    description: string | null
                    foundry_id: string
                    id: string
                    parent_objective_id: string | null
                    progress: number | null
                    status: string | null
                    title: string
                    updated_at: string | null
                }
                Insert: {
                    created_at?: string | null
                    creator_id: string
                    description?: string | null
                    foundry_id: string
                    id?: string
                    parent_objective_id?: string | null
                    progress?: number | null
                    status?: string | null
                    title: string
                    updated_at?: string | null
                }
                Update: {
                    created_at?: string | null
                    creator_id?: string
                    description?: string | null
                    foundry_id?: string
                    id?: string
                    parent_objective_id?: string | null
                    progress?: number | null
                    status?: string | null
                    title?: string
                    updated_at?: string | null
                }
                Relationships: [
                    {
                        foreignKeyName: "objectives_creator_id_fkey"
                        columns: ["creator_id"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "objectives_parent_objective_id_fkey"
                        columns: ["parent_objective_id"]
                        isOneToOne: false
                        referencedRelation: "objectives"
                        referencedColumns: ["id"]
                    },
                ]
            }
            profiles: {
                Row: {
                    avatar_url: string | null
                    created_at: string | null
                    email: string
                    foundry_id: string
                    full_name: string | null
                    id: string
                    role: Database["public"]["Enums"]["member_role"]
                    updated_at: string | null
                }
                Insert: {
                    avatar_url?: string | null
                    created_at?: string | null
                    email: string
                    foundry_id: string
                    full_name?: string | null
                    id: string
                    role?: Database["public"]["Enums"]["member_role"]
                    updated_at?: string | null
                }
                Update: {
                    avatar_url?: string | null
                    created_at?: string | null
                    email?: string
                    foundry_id?: string
                    full_name?: string | null
                    id?: string
                    role?: Database["public"]["Enums"]["member_role"]
                    updated_at?: string | null
                }
                Relationships: []
            }
            task_assignees: {
                Row: {
                    created_at: string | null
                    profile_id: string
                    task_id: string
                }
                Insert: {
                    created_at?: string | null
                    profile_id: string
                    task_id: string
                }
                Update: {
                    created_at?: string | null
                    profile_id?: string
                    task_id?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "task_assignees_profile_id_fkey"
                        columns: ["profile_id"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "task_assignees_task_id_fkey"
                        columns: ["task_id"]
                        isOneToOne: false
                        referencedRelation: "tasks"
                        referencedColumns: ["id"]
                    },
                ]
            }
            task_comments: {
                Row: {
                    content: string
                    created_at: string | null
                    foundry_id: string
                    id: string
                    is_system_log: boolean | null
                    task_id: string
                    user_id: string
                }
                Insert: {
                    content: string
                    created_at?: string | null
                    foundry_id: string
                    id?: string
                    is_system_log?: boolean | null
                    task_id: string
                    user_id: string
                }
                Update: {
                    content?: string
                    created_at?: string | null
                    foundry_id?: string
                    id?: string
                    is_system_log?: boolean | null
                    task_id?: string
                    user_id?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "task_comments_task_id_fkey"
                        columns: ["task_id"]
                        isOneToOne: false
                        referencedRelation: "tasks"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "task_comments_user_id_fkey"
                        columns: ["user_id"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    },
                ]
            }
            task_files: {
                Row: {
                    created_at: string | null
                    file_name: string
                    file_path: string
                    file_size: number
                    id: string
                    mime_type: string
                    task_id: string
                    uploaded_by: string
                }
                Insert: {
                    created_at?: string | null
                    file_name: string
                    file_path: string
                    file_size: number
                    id?: string
                    mime_type: string
                    task_id: string
                    uploaded_by: string
                }
                Update: {
                    created_at?: string | null
                    file_name?: string
                    file_path?: string
                    file_size?: number
                    id?: string
                    mime_type?: string
                    task_id?: string
                    uploaded_by?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "task_files_task_id_fkey"
                        columns: ["task_id"]
                        isOneToOne: false
                        referencedRelation: "tasks"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "task_files_uploaded_by_fkey"
                        columns: ["uploaded_by"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    },
                ]
            }
            task_history: {
                Row: {
                    action_type: string
                    changes: Json | null
                    created_at: string | null
                    id: string
                    task_id: string
                    user_id: string
                }
                Insert: {
                    action_type: string
                    changes?: Json | null
                    created_at?: string | null
                    id?: string
                    task_id: string
                    user_id: string
                }
                Update: {
                    action_type?: string
                    changes?: Json | null
                    created_at?: string | null
                    id?: string
                    task_id?: string
                    user_id?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "task_history_task_id_fkey"
                        columns: ["task_id"]
                        isOneToOne: false
                        referencedRelation: "tasks"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "task_history_user_id_fkey"
                        columns: ["user_id"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    },
                ]
            }
            tasks: {
                Row: {
                    amendment_notes: string | null
                    assignee_id: string | null
                    created_at: string | null
                    creator_id: string
                    description: string | null
                    end_date: string | null
                    forwarding_history: Json | null
                    foundry_id: string
                    id: string
                    objective_id: string | null
                    progress: number | null
                    start_date: string | null
                    status: Database["public"]["Enums"]["task_status"] | null
                    task_number: number
                    title: string
                    updated_at: string | null
                    risk_level: Database["public"]["Enums"]["risk_level"]
                    client_visible: boolean | null
                    nudge_count: number | null
                    last_nudge_at: string | null
                }
                Insert: {
                    amendment_notes?: string | null
                    assignee_id?: string | null
                    created_at?: string | null
                    creator_id: string
                    description?: string | null
                    end_date?: string | null
                    forwarding_history?: Json | null
                    foundry_id: string
                    id?: string
                    objective_id?: string | null
                    progress?: number | null
                    start_date?: string | null
                    status?: Database["public"]["Enums"]["task_status"] | null
                    task_number?: number
                    title: string
                    updated_at?: string | null
                    risk_level?: Database["public"]["Enums"]["risk_level"]
                    client_visible?: boolean | null
                    nudge_count?: number | null
                    last_nudge_at?: string | null
                }
                Update: {
                    amendment_notes?: string | null
                    assignee_id?: string | null
                    created_at?: string | null
                    creator_id?: string
                    description?: string | null
                    end_date?: string | null
                    forwarding_history?: Json | null
                    foundry_id?: string
                    id?: string
                    objective_id?: string | null
                    progress?: number | null
                    start_date?: string | null
                    status?: Database["public"]["Enums"]["task_status"] | null
                    task_number?: number
                    title?: string
                    updated_at?: string | null
                    risk_level?: Database["public"]["Enums"]["risk_level"]
                    client_visible?: boolean | null
                    nudge_count?: number | null
                    last_nudge_at?: string | null
                }
                Relationships: [
                    {
                        foreignKeyName: "tasks_assignee_id_fkey"
                        columns: ["assignee_id"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "tasks_creator_id_fkey"
                        columns: ["creator_id"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "tasks_objective_id_fkey"
                        columns: ["objective_id"]
                        isOneToOne: false
                        referencedRelation: "objectives"
                        referencedColumns: ["id"]
                    },
                ]
            }
        }
        Views: {
            [_ in never]: never
        }
        Functions: {
            [_ in never]: never
        }
        Enums: {
            member_role: "Executive" | "Apprentice" | "AI_Agent" | "Founder"
            provider_type:
            | "Legal"
            | "Financial"
            | "VC"
            | "Additive Manufacturing"
            | "Fabrication"
            rfq_status: "Open" | "Bidding" | "Awarded" | "Closed"
            task_status:
            | "Pending"
            | "Accepted"
            | "Rejected"
            | "Amended"
            | "Amended_Pending_Approval"
            | "Pending_Peer_Review"
            | "Pending_Executive_Approval"
            | "Completed"
            risk_level: "Low" | "Medium" | "High"
        }
        CompositeTypes: {
            [_ in never]: never
        }
    }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
    PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
    TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
    ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
            Row: infer R
        }
    ? R
    : never
    : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
            Row: infer R
        }
    ? R
    : never
    : never

export type TablesInsert<
    PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
    TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
    ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
        Insert: infer I
    }
    ? I
    : never
    : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
    }
    ? I
    : never
    : never

export type TablesUpdate<
    PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
    TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
    ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
        Update: infer U
    }
    ? U
    : never
    : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
    }
    ? U
    : never
    : never

export type Enums<
    PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
    EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
    ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
    : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
    PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
    CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
        schema: keyof Database
    }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
    ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
    : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never
