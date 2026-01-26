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
            apprentice_listings: {
                Row: {
                    availability_hours_per_week: number | null
                    availability_status: string | null
                    bio: string | null
                    created_at: string | null
                    education: string | null
                    headline: string | null
                    hourly_rate: number | null
                    id: string
                    is_verified: boolean | null
                    learning_goals: string[] | null
                    linkedin_url: string | null
                    portfolio_url: string | null
                    rating_average: number | null
                    review_count: number | null
                    skills: string[] | null
                    timezone: string | null
                    title: string | null
                    updated_at: string | null
                    user_id: string | null
                    visibility: string | null
                }
                Insert: {
                    availability_hours_per_week?: number | null
                    availability_status?: string | null
                    bio?: string | null
                    created_at?: string | null
                    education?: string | null
                    headline?: string | null
                    hourly_rate?: number | null
                    id?: string
                    is_verified?: boolean | null
                    learning_goals?: string[] | null
                    linkedin_url?: string | null
                    portfolio_url?: string | null
                    rating_average?: number | null
                    review_count?: number | null
                    skills?: string[] | null
                    timezone?: string | null
                    title?: string | null
                    updated_at?: string | null
                    user_id?: string | null
                    visibility?: string | null
                }
                Update: {
                    availability_hours_per_week?: number | null
                    availability_status?: string | null
                    bio?: string | null
                    created_at?: string | null
                    education?: string | null
                    headline?: string | null
                    hourly_rate?: number | null
                    id?: string
                    is_verified?: boolean | null
                    learning_goals?: string[] | null
                    linkedin_url?: string | null
                    portfolio_url?: string | null
                    rating_average?: number | null
                    review_count?: number | null
                    skills?: string[] | null
                    timezone?: string | null
                    title?: string | null
                    updated_at?: string | null
                    user_id?: string | null
                    visibility?: string | null
                }
                Relationships: []
            }
            event_attendees: {
                Row: {
                    event_id: string
                    profile_id: string
                }
                Insert: {
                    event_id: string
                    profile_id: string
                }
                Update: {
                    event_id?: string
                    profile_id?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "event_attendees_event_id_fkey"
                        columns: ["event_id"]
                        isOneToOne: false
                        referencedRelation: "guild_events"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "event_attendees_profile_id_fkey"
                        columns: ["profile_id"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    },
                ]
            }
            foundry_integrations: {
                Row: {
                    config: Json | null
                    created_at: string | null
                    foundry_id: string
                    id: string
                    service_type: string
                    updated_at: string | null
                }
                Insert: {
                    config?: Json | null
                    created_at?: string | null
                    foundry_id: string
                    id?: string
                    service_type: string
                    updated_at?: string | null
                }
                Update: {
                    config?: Json | null
                    created_at?: string | null
                    foundry_id?: string
                    id?: string
                    service_type?: string
                    updated_at?: string | null
                }
                Relationships: []
            }
            guild_events: {
                Row: {
                    created_by: string | null
                    description: string | null
                    event_date: string
                    foundry_id: string
                    id: string
                    is_executive_only: boolean | null
                    location_geo: string | null
                    title: string
                }
                Insert: {
                    created_by?: string | null
                    description?: string | null
                    event_date: string
                    foundry_id: string
                    id?: string
                    is_executive_only?: boolean | null
                    location_geo?: string | null
                    title: string
                }
                Update: {
                    created_by?: string | null
                    description?: string | null
                    event_date?: string
                    foundry_id?: string
                    id?: string
                    is_executive_only?: boolean | null
                    location_geo?: string | null
                    title?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "guild_events_created_by_fkey"
                        columns: ["created_by"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    },
                ]
            }
            manufacturing_rfqs: {
                Row: {
                    budget_range: string | null
                    created_by: string | null
                    foundry_id: string
                    id: string
                    specifications: string
                    status: Database["public"]["Enums"]["rfq_status"] | null
                    title: string
                }
                Insert: {
                    budget_range?: string | null
                    created_by?: string | null
                    foundry_id: string
                    id?: string
                    specifications: string
                    status?: Database["public"]["Enums"]["rfq_status"] | null
                    title: string
                }
                Update: {
                    budget_range?: string | null
                    created_by?: string | null
                    foundry_id?: string
                    id?: string
                    specifications?: string
                    status?: Database["public"]["Enums"]["rfq_status"] | null
                    title?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "manufacturing_rfqs_created_by_fkey"
                        columns: ["created_by"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    },
                ]
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
                    status: string
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
                    status?: string
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
                    status?: string
                    title?: string
                    updated_at?: string | null
                }
                Relationships: [
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
                    role: Database["public"]["Enums"]["member_role"]
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
            service_providers: {
                Row: {
                    company_name: string
                    contact_info: Json | null
                    id: string
                    is_verified: boolean | null
                    provider_type: Database["public"]["Enums"]["provider_type"]
                }
                Insert: {
                    company_name: string
                    contact_info?: Json | null
                    id?: string
                    is_verified?: boolean | null
                    provider_type: Database["public"]["Enums"]["provider_type"]
                }
                Update: {
                    company_name?: string
                    contact_info?: Json | null
                    id?: string
                    is_verified?: boolean | null
                    provider_type?: Database["public"]["Enums"]["provider_type"]
                }
                Relationships: []
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
                    start_date: string | null
                    status: Database["public"]["Enums"]["task_status"] | null
                    title: string
                    updated_at: string | null
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
                    start_date?: string | null
                    status?: Database["public"]["Enums"]["task_status"] | null
                    title: string
                    updated_at?: string | null
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
                    start_date?: string | null
                    status?: Database["public"]["Enums"]["task_status"] | null
                    title?: string
                    updated_at?: string | null
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
            verified_reviews: {
                Row: {
                    comment: string | null
                    created_at: string | null
                    foundry_id: string
                    id: string
                    rating: number | null
                    reviewer_id: string | null
                    target_id: string | null
                    task_id: string | null
                }
                Insert: {
                    comment?: string | null
                    created_at?: string | null
                    foundry_id: string
                    id?: string
                    rating?: number | null
                    reviewer_id?: string | null
                    target_id?: string | null
                    task_id?: string | null
                }
                Update: {
                    comment?: string | null
                    created_at?: string | null
                    foundry_id?: string
                    id?: string
                    rating?: number | null
                    reviewer_id?: string | null
                    target_id?: string | null
                    task_id?: string | null
                }
                Relationships: [
                    {
                        foreignKeyName: "verified_reviews_reviewer_id_fkey"
                        columns: ["reviewer_id"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "verified_reviews_task_id_fkey"
                        columns: ["task_id"]
                        isOneToOne: false
                        referencedRelation: "tasks"
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
            member_role: "Executive" | "Apprentice" | "AI_Agent"
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
            | "Completed"
        }
        CompositeTypes: {
            [_ in never]: never
        }
    }
}

export type Tables<
    PublicTableNameOrOptions extends
    | keyof (Database["public"]["Tables"] & Database["public"]["Views"])
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
    : PublicTableNameOrOptions extends keyof (Database["public"]["Tables"] &
        Database["public"]["Views"])
    ? (Database["public"]["Tables"] &
        Database["public"]["Views"])[PublicTableNameOrOptions] extends {
            Row: infer R
        }
    ? R
    : never
    : never

export type TablesInsert<
    PublicTableNameOrOptions extends
    | keyof Database["public"]["Tables"]
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
    : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
    ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
    }
    ? I
    : never
    : never

export type TablesUpdate<
    PublicTableNameOrOptions extends
    | keyof Database["public"]["Tables"]
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
    : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
    ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
    }
    ? U
    : never
    : never

export type Enums<
    PublicEnumNameOrOptions extends
    | keyof Database["public"]["Enums"]
    | { schema: keyof Database },
    EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
    ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
    : PublicEnumNameOrOptions extends keyof Database["public"]["Enums"]
    ? Database["public"]["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
    PublicCompositeTypeNameOrOptions extends
    | keyof Database["public"]["CompositeTypes"]
    | { schema: keyof Database },
    CompositeTypeName extends PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
    ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
    : PublicCompositeTypeNameOrOptions extends keyof Database["public"]["CompositeTypes"]
    ? Database["public"]["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never
