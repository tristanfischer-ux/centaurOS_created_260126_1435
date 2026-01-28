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
      approval_delegations: {
        Row: {
          all_tasks: boolean | null
          created_at: string
          delegate_id: string
          delegator_id: string
          end_date: string | null
          foundry_id: string
          id: string
          is_active: boolean | null
          reason: string | null
          start_date: string
          task_types: string[] | null
          updated_at: string
        }
        Insert: {
          all_tasks?: boolean | null
          created_at?: string
          delegate_id: string
          delegator_id: string
          end_date?: string | null
          foundry_id: string
          id?: string
          is_active?: boolean | null
          reason?: string | null
          start_date?: string
          task_types?: string[] | null
          updated_at?: string
        }
        Update: {
          all_tasks?: boolean | null
          created_at?: string
          delegate_id?: string
          delegator_id?: string
          end_date?: string | null
          foundry_id?: string
          id?: string
          is_active?: boolean | null
          reason?: string | null
          start_date?: string
          task_types?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_delegations_delegate_id_fkey"
            columns: ["delegate_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_delegations_delegator_id_fkey"
            columns: ["delegator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_delegations_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
        ]
      }
      business_functions: {
        Row: {
          id: string
          foundry_id: string
          category: string
          name: string
          description: string | null
          coverage_status: string
          covered_by: string | null
          covered_by_type: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          foundry_id: string
          category: string
          name: string
          description?: string | null
          coverage_status?: string
          covered_by?: string | null
          covered_by_type?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          foundry_id?: string
          category?: string
          name?: string
          description?: string | null
          coverage_status?: string
          covered_by?: string | null
          covered_by_type?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
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
          foundry_id?: string
          id?: string
          provider_id?: string | null
          status?: string | null
          tool_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "foundry_stack_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "foundry_stack_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "ai_tools"
            referencedColumns: ["id"]
          },
        ]
      }
      guild_events: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          event_date: string
          foundry_id: string | null
          id: string
          is_executive_only: boolean
          location_address: string | null
          location_geo: string | null
          max_attendees: number | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_date: string
          foundry_id?: string | null
          id?: string
          is_executive_only?: boolean
          location_address?: string | null
          location_geo?: string | null
          max_attendees?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_date?: string
          foundry_id?: string | null
          id?: string
          is_executive_only?: boolean
          location_address?: string | null
          location_geo?: string | null
          max_attendees?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guild_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guild_events_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
        ]
      }
      manufacturing_rfqs: {
        Row: {
          budget_range: string | null
          created_at: string | null
          created_by: string | null
          foundry_id: string
          id: string
          specifications: string
          status: Database["public"]["Enums"]["rfq_status"] | null
          title: string
        }
        Insert: {
          budget_range?: string | null
          created_at?: string | null
          created_by?: string | null
          foundry_id: string
          id?: string
          specifications: string
          status?: Database["public"]["Enums"]["rfq_status"] | null
          title: string
        }
        Update: {
          budget_range?: string | null
          created_at?: string | null
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
      marketplace_listings: {
        Row: {
          attributes: Json | null
          category: Database["public"]["Enums"]["marketplace_category"]
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          is_verified: boolean | null
          subcategory: string
          title: string
        }
        Insert: {
          attributes?: Json | null
          category: Database["public"]["Enums"]["marketplace_category"]
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_verified?: boolean | null
          subcategory: string
          title: string
        }
        Update: {
          attributes?: Json | null
          category?: Database["public"]["Enums"]["marketplace_category"]
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_verified?: boolean | null
          subcategory?: string
          title?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          foundry_id: string
          id: string
          is_read: boolean
          link: string | null
          message: string | null
          metadata: Json | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          foundry_id: string
          id?: string
          is_read?: boolean
          link?: string | null
          message?: string | null
          metadata?: Json | null
          read_at?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          foundry_id?: string
          id?: string
          is_read?: boolean
          link?: string | null
          message?: string | null
          metadata?: Json | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      objective_packs: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          difficulty: string | null
          estimated_duration: string | null
          icon_name: string | null
          id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          difficulty?: string | null
          estimated_duration?: string | null
          icon_name?: string | null
          id?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          difficulty?: string | null
          estimated_duration?: string | null
          icon_name?: string | null
          id?: string
          title?: string
          updated_at?: string | null
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
      pack_items: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          order_index: number
          pack_id: string
          role: Database["public"]["Enums"]["member_role"]
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          order_index?: number
          pack_id: string
          role: Database["public"]["Enums"]["member_role"]
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          order_index?: number
          pack_id?: string
          role?: Database["public"]["Enums"]["member_role"]
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pack_items_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "objective_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      presence: {
        Row: {
          availability_end: string | null
          availability_start: string | null
          created_at: string
          current_task_id: string | null
          focus_until: string | null
          id: string
          last_seen: string
          status: Database["public"]["Enums"]["presence_status"]
          status_message: string | null
          timezone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          availability_end?: string | null
          availability_start?: string | null
          created_at?: string
          current_task_id?: string | null
          focus_until?: string | null
          id?: string
          last_seen?: string
          status?: Database["public"]["Enums"]["presence_status"]
          status_message?: string | null
          timezone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          availability_end?: string | null
          availability_start?: string | null
          created_at?: string
          current_task_id?: string | null
          focus_until?: string | null
          id?: string
          last_seen?: string
          status?: Database["public"]["Enums"]["presence_status"]
          status_message?: string | null
          timezone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "presence_current_task_id_fkey"
            columns: ["current_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presence_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          capacity_score: number | null
          created_at: string | null
          email: string
          foundry_id: string
          full_name: string | null
          id: string
          paired_ai_id: string | null
          phone_number: string | null
          role: Database["public"]["Enums"]["member_role"]
          skills: string[] | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          capacity_score?: number | null
          created_at?: string | null
          email: string
          foundry_id: string
          full_name?: string | null
          id: string
          paired_ai_id?: string | null
          phone_number?: string | null
          role?: Database["public"]["Enums"]["member_role"]
          skills?: string[] | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          capacity_score?: number | null
          created_at?: string | null
          email?: string
          foundry_id?: string
          full_name?: string | null
          id?: string
          paired_ai_id?: string | null
          phone_number?: string | null
          role?: Database["public"]["Enums"]["member_role"]
          skills?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_paired_ai_id_fkey"
            columns: ["paired_ai_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      standup_summaries: {
        Row: {
          blockers_summary: string | null
          created_at: string
          foundry_id: string
          generated_at: string
          id: string
          key_highlights: string[] | null
          members_with_blockers: number
          summary_date: string
          summary_text: string
          team_mood: string | null
          total_standups: number
        }
        Insert: {
          blockers_summary?: string | null
          created_at?: string
          foundry_id: string
          generated_at?: string
          id?: string
          key_highlights?: string[] | null
          members_with_blockers?: number
          summary_date?: string
          summary_text: string
          team_mood?: string | null
          total_standups?: number
        }
        Update: {
          blockers_summary?: string | null
          created_at?: string
          foundry_id?: string
          generated_at?: string
          id?: string
          key_highlights?: string[] | null
          members_with_blockers?: number
          summary_date?: string
          summary_text?: string
          team_mood?: string | null
          total_standups?: number
        }
        Relationships: []
      }
      standups: {
        Row: {
          blocker_severity: string | null
          blocker_tags: string[] | null
          blockers: string | null
          completed: string | null
          created_at: string
          foundry_id: string
          id: string
          mood: string | null
          needs_help: boolean | null
          planned: string | null
          standup_date: string
          submitted_at: string
          user_id: string
        }
        Insert: {
          blocker_severity?: string | null
          blocker_tags?: string[] | null
          blockers?: string | null
          completed?: string | null
          created_at?: string
          foundry_id: string
          id?: string
          mood?: string | null
          needs_help?: boolean | null
          planned?: string | null
          standup_date?: string
          submitted_at?: string
          user_id: string
        }
        Update: {
          blocker_severity?: string | null
          blocker_tags?: string[] | null
          blockers?: string | null
          completed?: string | null
          created_at?: string
          foundry_id?: string
          id?: string
          mood?: string | null
          needs_help?: boolean | null
          planned?: string | null
          standup_date?: string
          submitted_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "standups_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_assignees: {
        Row: {
          created_at: string | null
          id: string
          profile_id: string
          task_id: string
          team_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          profile_id: string
          task_id: string
          team_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          profile_id?: string
          task_id?: string
          team_id?: string | null
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
          {
            foreignKeyName: "task_assignees_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
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
          file_size: number | null
          id: string
          mime_type: string | null
          task_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          task_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          task_id?: string
          uploaded_by?: string | null
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
      task_requirements: {
        Row: {
          complexity: string | null
          created_at: string
          estimated_hours: number | null
          id: string
          preferred_skills: string[] | null
          required_skills: string[] | null
          task_id: string
        }
        Insert: {
          complexity?: string | null
          created_at?: string
          estimated_hours?: number | null
          id?: string
          preferred_skills?: string[] | null
          required_skills?: string[] | null
          task_id: string
        }
        Update: {
          complexity?: string | null
          created_at?: string
          estimated_hours?: number | null
          id?: string
          preferred_skills?: string[] | null
          required_skills?: string[] | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_requirements_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          amendment_notes: string | null
          approval_escalated: boolean | null
          approval_requested_at: string | null
          assignee_id: string | null
          client_visible: boolean | null
          created_at: string | null
          creator_id: string
          description: string | null
          end_date: string | null
          escalation_reason: string | null
          forwarding_history: Json | null
          foundry_id: string
          id: string
          last_nudge_at: string | null
          nudge_count: number | null
          objective_id: string | null
          progress: number | null
          risk_level: Database["public"]["Enums"]["risk_level"]
          start_date: string | null
          status: Database["public"]["Enums"]["task_status"] | null
          task_number: number
          title: string
          updated_at: string | null
        }
        Insert: {
          amendment_notes?: string | null
          approval_escalated?: boolean | null
          approval_requested_at?: string | null
          assignee_id?: string | null
          client_visible?: boolean | null
          created_at?: string | null
          creator_id: string
          description?: string | null
          end_date?: string | null
          escalation_reason?: string | null
          forwarding_history?: Json | null
          foundry_id: string
          id?: string
          last_nudge_at?: string | null
          nudge_count?: number | null
          objective_id?: string | null
          progress?: number | null
          risk_level?: Database["public"]["Enums"]["risk_level"]
          start_date?: string | null
          status?: Database["public"]["Enums"]["task_status"] | null
          task_number?: number
          title: string
          updated_at?: string | null
        }
        Update: {
          amendment_notes?: string | null
          approval_escalated?: boolean | null
          approval_requested_at?: string | null
          assignee_id?: string | null
          client_visible?: boolean | null
          created_at?: string | null
          creator_id?: string
          description?: string | null
          end_date?: string | null
          escalation_reason?: string | null
          forwarding_history?: Json | null
          foundry_id?: string
          id?: string
          last_nudge_at?: string | null
          nudge_count?: number | null
          objective_id?: string | null
          progress?: number | null
          risk_level?: Database["public"]["Enums"]["risk_level"]
          start_date?: string | null
          status?: Database["public"]["Enums"]["task_status"] | null
          task_number?: number
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
      team_members: {
        Row: {
          created_at: string | null
          profile_id: string
          team_id: string
        }
        Insert: {
          created_at?: string | null
          profile_id: string
          team_id: string
        }
        Update: {
          created_at?: string | null
          profile_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string | null
          foundry_id: string
          id: string
          is_auto_generated: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          foundry_id: string
          id?: string
          is_auto_generated?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          foundry_id?: string
          id?: string
          is_auto_generated?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_workload_score: { Args: { p_user_id: string }; Returns: number }
      can_user_approve: {
        Args: { p_task_id: string; p_user_id: string }
        Returns: boolean
      }
      create_notification: {
        Args: {
          p_link?: string
          p_message?: string
          p_metadata?: Json
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: string
      }
      escalate_task: {
        Args: { p_reason?: string; p_task_id: string }
        Returns: {
          amendment_notes: string | null
          approval_escalated: boolean | null
          approval_requested_at: string | null
          assignee_id: string | null
          client_visible: boolean | null
          created_at: string | null
          creator_id: string
          description: string | null
          end_date: string | null
          escalation_reason: string | null
          forwarding_history: Json | null
          foundry_id: string
          id: string
          last_nudge_at: string | null
          nudge_count: number | null
          objective_id: string | null
          progress: number | null
          risk_level: Database["public"]["Enums"]["risk_level"]
          start_date: string | null
          status: Database["public"]["Enums"]["task_status"] | null
          task_number: number
          title: string
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_my_foundry_id: { Args: never; Returns: string }
      get_my_role: {
        Args: never
        Returns: Database["public"]["Enums"]["member_role"]
      }
      get_my_today_standup: {
        Args: never
        Returns: {
          blocker_severity: string | null
          blocker_tags: string[] | null
          blockers: string | null
          completed: string | null
          created_at: string
          foundry_id: string
          id: string
          mood: string | null
          needs_help: boolean | null
          planned: string | null
          standup_date: string
          submitted_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "standups"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_tasks_needing_escalation: {
        Args: { p_timeout_hours?: number }
        Returns: {
          approval_requested_at: string
          hours_pending: number
          status: string
          task_id: string
          task_title: string
        }[]
      }
      submit_standup: {
        Args: {
          p_blocker_severity?: string
          p_blocker_tags?: string[]
          p_blockers?: string
          p_completed?: string
          p_mood?: string
          p_needs_help?: boolean
          p_planned?: string
        }
        Returns: {
          blocker_severity: string | null
          blocker_tags: string[] | null
          blockers: string | null
          completed: string | null
          created_at: string
          foundry_id: string
          id: string
          mood: string | null
          needs_help: boolean | null
          planned: string | null
          standup_date: string
          submitted_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "standups"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      suggest_task_assignees: {
        Args: {
          p_exclude_user_ids?: string[]
          p_limit?: number
          p_preferred_skills?: string[]
          p_required_skills?: string[]
        }
        Returns: {
          full_name: string
          match_reason: string
          role: string
          skill_match_score: number
          skills: string[]
          total_score: number
          user_id: string
          workload_score: number
        }[]
      }
      upsert_presence: {
        Args: {
          p_current_task_id?: string
          p_status?: Database["public"]["Enums"]["presence_status"]
          p_status_message?: string
          p_timezone?: string
        }
        Returns: {
          availability_end: string | null
          availability_start: string | null
          created_at: string
          current_task_id: string | null
          focus_until: string | null
          id: string
          last_seen: string
          status: Database["public"]["Enums"]["presence_status"]
          status_message: string | null
          timezone: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "presence"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      marketplace_category: "People" | "Products" | "Services" | "AI"
      member_role: "Executive" | "Apprentice" | "AI_Agent" | "Founder"
      presence_status: "online" | "away" | "focus" | "offline"
      provider_type:
        | "Legal"
        | "Financial"
        | "VC"
        | "Additive Manufacturing"
        | "Fabrication"
      rfq_status: "Open" | "Bidding" | "Awarded" | "Closed"
      risk_level: "Low" | "Medium" | "High"
      task_status:
        | "Pending"
        | "Accepted"
        | "Rejected"
        | "Amended"
        | "Amended_Pending_Approval"
        | "Completed"
        | "Pending_Peer_Review"
        | "Pending_Executive_Approval"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      marketplace_category: ["People", "Products", "Services", "AI"],
      member_role: ["Executive", "Apprentice", "AI_Agent", "Founder"],
      presence_status: ["online", "away", "focus", "offline"],
      provider_type: [
        "Legal",
        "Financial",
        "VC",
        "Additive Manufacturing",
        "Fabrication",
      ],
      rfq_status: ["Open", "Bidding", "Awarded", "Closed"],
      risk_level: ["Low", "Medium", "High"],
      task_status: [
        "Pending",
        "Accepted",
        "Rejected",
        "Amended",
        "Amended_Pending_Approval",
        "Completed",
        "Pending_Peer_Review",
        "Pending_Executive_Approval",
      ],
    },
  },
} as const
