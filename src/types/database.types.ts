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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      account_balances: {
        Row: {
          balance_amount: number | null
          created_at: string | null
          currency: string | null
          id: string
          last_topped_up_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          balance_amount?: number | null
          created_at?: string | null
          currency?: string | null
          id?: string
          last_topped_up_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          balance_amount?: number | null
          created_at?: string | null
          currency?: string | null
          id?: string
          last_topped_up_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_balances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "account_balances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_events: {
        Row: {
          created_at: string
          event_data: Json | null
          event_type: string
          foundry_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_data?: Json | null
          event_type: string
          foundry_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_data?: Json | null
          event_type?: string
          foundry_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_events_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "activity_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_audit_log: {
        Row: {
          action: string
          admin_id: string
          after_state: Json | null
          before_state: Json | null
          created_at: string | null
          entity_id: string | null
          entity_type: string
          id: string
          reason: string | null
        }
        Insert: {
          action: string
          admin_id: string
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          reason?: string | null
        }
        Update: {
          action?: string
          admin_id?: string
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_users: {
        Row: {
          admin_role: Database["public"]["Enums"]["admin_role"]
          created_at: string | null
          id: string
          permissions: Json | null
          user_id: string
        }
        Insert: {
          admin_role: Database["public"]["Enums"]["admin_role"]
          created_at?: string | null
          id?: string
          permissions?: Json | null
          user_id: string
        }
        Update: {
          admin_role?: Database["public"]["Enums"]["admin_role"]
          created_at?: string | null
          id?: string
          permissions?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "admin_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      advisory_answers: {
        Row: {
          author_id: string | null
          author_type: string
          body: string
          created_at: string
          id: string
          is_accepted: boolean
          marketplace_suggestions: Json | null
          question_id: string
          updated_at: string
          upvotes: number
          verification_status: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          author_id?: string | null
          author_type: string
          body: string
          created_at?: string
          id?: string
          is_accepted?: boolean
          marketplace_suggestions?: Json | null
          question_id: string
          updated_at?: string
          upvotes?: number
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          author_id?: string | null
          author_type?: string
          body?: string
          created_at?: string
          id?: string
          is_accepted?: boolean
          marketplace_suggestions?: Json | null
          question_id?: string
          updated_at?: string
          upvotes?: number
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "advisory_answers_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "advisory_answers_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advisory_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "advisory_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advisory_answers_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "advisory_answers_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      advisory_comments: {
        Row: {
          answer_id: string
          author_id: string | null
          body: string
          created_at: string
          id: string
        }
        Insert: {
          answer_id: string
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
        }
        Update: {
          answer_id?: string
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "advisory_comments_answer_id_fkey"
            columns: ["answer_id"]
            isOneToOne: false
            referencedRelation: "advisory_answers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advisory_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "advisory_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      advisory_questions: {
        Row: {
          asked_by: string | null
          body: string
          category: string | null
          created_at: string
          foundry_id: string
          id: string
          status: string
          tags: string[] | null
          title: string
          updated_at: string
          view_count: number
          visibility: string
        }
        Insert: {
          asked_by?: string | null
          body: string
          category?: string | null
          created_at?: string
          foundry_id: string
          id?: string
          status?: string
          tags?: string[] | null
          title: string
          updated_at?: string
          view_count?: number
          visibility?: string
        }
        Update: {
          asked_by?: string | null
          body?: string
          category?: string | null
          created_at?: string
          foundry_id?: string
          id?: string
          status?: string
          tags?: string[] | null
          title?: string
          updated_at?: string
          view_count?: number
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "advisory_questions_asked_by_fkey"
            columns: ["asked_by"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "advisory_questions_asked_by_fkey"
            columns: ["asked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      advisory_votes: {
        Row: {
          answer_id: string
          created_at: string
          id: string
          user_id: string
          vote_type: string
        }
        Insert: {
          answer_id: string
          created_at?: string
          id?: string
          user_id: string
          vote_type: string
        }
        Update: {
          answer_id?: string
          created_at?: string
          id?: string
          user_id?: string
          vote_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "advisory_votes_answer_id_fkey"
            columns: ["answer_id"]
            isOneToOne: false
            referencedRelation: "advisory_answers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advisory_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "advisory_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_action_log: {
        Row: {
          action_description: string | null
          action_type: string
          agent_id: string | null
          agent_name: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          details: Json | null
          foundry_id: string
          id: string
          rejection_reason: string | null
          requires_approval_from: string | null
          status: string | null
          tier: string
        }
        Insert: {
          action_description?: string | null
          action_type: string
          agent_id?: string | null
          agent_name?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          details?: Json | null
          foundry_id: string
          id?: string
          rejection_reason?: string | null
          requires_approval_from?: string | null
          status?: string | null
          tier: string
        }
        Update: {
          action_description?: string | null
          action_type?: string
          agent_id?: string | null
          agent_name?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          details?: Json | null
          foundry_id?: string
          id?: string
          rejection_reason?: string | null
          requires_approval_from?: string | null
          status?: string | null
          tier?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_action_log_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "agent_action_log_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_action_log_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "agent_action_log_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_action_log_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_action_log_requires_approval_from_fkey"
            columns: ["requires_approval_from"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "agent_action_log_requires_approval_from_fkey"
            columns: ["requires_approval_from"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_action_tier_map: {
        Row: {
          action_type: string
          created_at: string
          description: string | null
          id: string
          tier_name: string
        }
        Insert: {
          action_type: string
          created_at?: string
          description?: string | null
          id?: string
          tier_name: string
        }
        Update: {
          action_type?: string
          created_at?: string
          description?: string | null
          id?: string
          tier_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_action_tier_map_tier_name_fkey"
            columns: ["tier_name"]
            isOneToOne: false
            referencedRelation: "agent_permission_tiers"
            referencedColumns: ["tier_name"]
          },
        ]
      }
      agent_artifact_versions: {
        Row: {
          artifact_id: string
          change_summary: string | null
          content: string
          created_at: string
          edited_by: string | null
          foundry_id: string
          id: string
          title: string
          version_number: number
        }
        Insert: {
          artifact_id: string
          change_summary?: string | null
          content: string
          created_at?: string
          edited_by?: string | null
          foundry_id: string
          id?: string
          title: string
          version_number: number
        }
        Update: {
          artifact_id?: string
          change_summary?: string | null
          content?: string
          created_at?: string
          edited_by?: string | null
          foundry_id?: string
          id?: string
          title?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_artifact_versions_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "agent_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_artifact_versions_edited_by_fkey"
            columns: ["edited_by"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "agent_artifact_versions_edited_by_fkey"
            columns: ["edited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_artifact_versions_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_artifacts: {
        Row: {
          content: string
          content_type: string
          created_at: string
          created_by: string | null
          foundry_id: string
          id: string
          is_shared_with_foundry: boolean
          is_starred: boolean
          metadata: Json
          run_id: string | null
          shared_with: string[] | null
          title: string
          updated_at: string
          version_number: number
          workflow_id: string | null
        }
        Insert: {
          content?: string
          content_type?: string
          created_at?: string
          created_by?: string | null
          foundry_id: string
          id?: string
          is_shared_with_foundry?: boolean
          is_starred?: boolean
          metadata?: Json
          run_id?: string | null
          shared_with?: string[] | null
          title: string
          updated_at?: string
          version_number?: number
          workflow_id?: string | null
        }
        Update: {
          content?: string
          content_type?: string
          created_at?: string
          created_by?: string | null
          foundry_id?: string
          id?: string
          is_shared_with_foundry?: boolean
          is_starred?: boolean
          metadata?: Json
          run_id?: string | null
          shared_with?: string[] | null
          title?: string
          updated_at?: string
          version_number?: number
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_artifacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "agent_artifacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_artifacts_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_artifacts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_workflow_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_artifacts_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "agent_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_collaboration_contributions: {
        Row: {
          agent_id: string | null
          agent_name: string
          content: string
          contribution_type: string
          created_at: string
          id: string
          metadata: Json | null
          session_id: string
        }
        Insert: {
          agent_id?: string | null
          agent_name: string
          content: string
          contribution_type?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          session_id: string
        }
        Update: {
          agent_id?: string | null
          agent_name?: string
          content?: string
          contribution_type?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_collaboration_contributions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "agent_collaboration_contributions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_collaboration_contributions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "agent_collaboration_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_collaboration_sessions: {
        Row: {
          completed_at: string | null
          created_at: string
          description: string | null
          foundry_id: string
          id: string
          initiated_by_agent_id: string | null
          initiated_by_agent_name: string
          result_artifact_id: string | null
          result_summary: string | null
          status: string
          title: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          foundry_id: string
          id?: string
          initiated_by_agent_id?: string | null
          initiated_by_agent_name: string
          result_artifact_id?: string | null
          result_summary?: string | null
          status?: string
          title: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          foundry_id?: string
          id?: string
          initiated_by_agent_id?: string | null
          initiated_by_agent_name?: string
          result_artifact_id?: string | null
          result_summary?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_collaboration_sessions_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_collaboration_sessions_initiated_by_agent_id_fkey"
            columns: ["initiated_by_agent_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "agent_collaboration_sessions_initiated_by_agent_id_fkey"
            columns: ["initiated_by_agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_collaboration_sessions_result_artifact_id_fkey"
            columns: ["result_artifact_id"]
            isOneToOne: false
            referencedRelation: "agent_artifacts"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_custom_prompts: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          default_prompt: string
          description: string | null
          foundry_id: string
          icon: string
          id: string
          input_label: string | null
          output_label: string | null
          suggested_next: Json
          tags: Json
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          default_prompt?: string
          description?: string | null
          foundry_id: string
          icon?: string
          id?: string
          input_label?: string | null
          output_label?: string | null
          suggested_next?: Json
          tags?: Json
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          default_prompt?: string
          description?: string | null
          foundry_id?: string
          icon?: string
          id?: string
          input_label?: string | null
          output_label?: string | null
          suggested_next?: Json
          tags?: Json
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_custom_prompts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "agent_custom_prompts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_custom_prompts_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_delegation_requests: {
        Row: {
          completed_artifact_id: string | null
          completed_at: string | null
          context_objective_id: string | null
          context_task_id: string | null
          created_at: string
          description: string | null
          foundry_id: string
          id: string
          request_type: string
          requesting_agent_id: string | null
          requesting_agent_name: string
          responded_at: string | null
          response_note: string | null
          status: string
          target_agent_id: string | null
          target_agent_name: string
          title: string
        }
        Insert: {
          completed_artifact_id?: string | null
          completed_at?: string | null
          context_objective_id?: string | null
          context_task_id?: string | null
          created_at?: string
          description?: string | null
          foundry_id: string
          id?: string
          request_type: string
          requesting_agent_id?: string | null
          requesting_agent_name: string
          responded_at?: string | null
          response_note?: string | null
          status?: string
          target_agent_id?: string | null
          target_agent_name: string
          title: string
        }
        Update: {
          completed_artifact_id?: string | null
          completed_at?: string | null
          context_objective_id?: string | null
          context_task_id?: string | null
          created_at?: string
          description?: string | null
          foundry_id?: string
          id?: string
          request_type?: string
          requesting_agent_id?: string | null
          requesting_agent_name?: string
          responded_at?: string | null
          response_note?: string | null
          status?: string
          target_agent_id?: string | null
          target_agent_name?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_delegation_requests_completed_artifact_id_fkey"
            columns: ["completed_artifact_id"]
            isOneToOne: false
            referencedRelation: "agent_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_delegation_requests_context_objective_id_fkey"
            columns: ["context_objective_id"]
            isOneToOne: false
            referencedRelation: "objectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_delegation_requests_context_task_id_fkey"
            columns: ["context_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_delegation_requests_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_delegation_requests_requesting_agent_id_fkey"
            columns: ["requesting_agent_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "agent_delegation_requests_requesting_agent_id_fkey"
            columns: ["requesting_agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_delegation_requests_target_agent_id_fkey"
            columns: ["target_agent_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "agent_delegation_requests_target_agent_id_fkey"
            columns: ["target_agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_file_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_url: string
          foundry_id: string
          id: string
          message_index: number
          mime_type: string
          size_bytes: number
          thread_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_url: string
          foundry_id: string
          id?: string
          message_index?: number
          mime_type: string
          size_bytes: number
          thread_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_url?: string
          foundry_id?: string
          id?: string
          message_index?: number
          mime_type?: string
          size_bytes?: number
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_file_attachments_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_file_attachments_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "agent_memory_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_insights: {
        Row: {
          acted_on: boolean
          acted_on_at: string | null
          body: string
          created_at: string
          domain_data: Json | null
          expires_at: string | null
          foundry_id: string
          id: string
          insight_type: string
          is_dismissed: boolean
          is_read: boolean
          specialist_id: string
          suggested_actions: Json | null
          title: string
          urgency: string
        }
        Insert: {
          acted_on?: boolean
          acted_on_at?: string | null
          body: string
          created_at?: string
          domain_data?: Json | null
          expires_at?: string | null
          foundry_id: string
          id?: string
          insight_type: string
          is_dismissed?: boolean
          is_read?: boolean
          specialist_id: string
          suggested_actions?: Json | null
          title: string
          urgency?: string
        }
        Update: {
          acted_on?: boolean
          acted_on_at?: string | null
          body?: string
          created_at?: string
          domain_data?: Json | null
          expires_at?: string | null
          foundry_id?: string
          id?: string
          insight_type?: string
          is_dismissed?: boolean
          is_read?: boolean
          specialist_id?: string
          suggested_actions?: Json | null
          title?: string
          urgency?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_insights_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_memory_messages: {
        Row: {
          content: string
          created_at: string
          foundry_id: string
          id: string
          is_observed: boolean
          metadata: Json
          role: string
          thread_id: string
          token_count: number
        }
        Insert: {
          content: string
          created_at?: string
          foundry_id: string
          id?: string
          is_observed?: boolean
          metadata?: Json
          role?: string
          thread_id: string
          token_count?: number
        }
        Update: {
          content?: string
          created_at?: string
          foundry_id?: string
          id?: string
          is_observed?: boolean
          metadata?: Json
          role?: string
          thread_id?: string
          token_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_memory_messages_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_memory_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "agent_memory_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_memory_observations: {
        Row: {
          created_at: string
          foundry_id: string
          id: string
          observations_text: string
          thread_id: string
          token_count: number
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          foundry_id: string
          id?: string
          observations_text?: string
          thread_id: string
          token_count?: number
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          foundry_id?: string
          id?: string
          observations_text?: string
          thread_id?: string
          token_count?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_memory_observations_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_memory_observations_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "agent_memory_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_memory_threads: {
        Row: {
          context_id: string | null
          context_type: string
          created_at: string
          created_by: string | null
          foundry_id: string
          id: string
          last_interaction_at: string | null
          metadata: Json
          total_interactions: number | null
          trust_level: string | null
          updated_at: string
        }
        Insert: {
          context_id?: string | null
          context_type?: string
          created_at?: string
          created_by?: string | null
          foundry_id: string
          id?: string
          last_interaction_at?: string | null
          metadata?: Json
          total_interactions?: number | null
          trust_level?: string | null
          updated_at?: string
        }
        Update: {
          context_id?: string | null
          context_type?: string
          created_at?: string
          created_by?: string | null
          foundry_id?: string
          id?: string
          last_interaction_at?: string | null
          metadata?: Json
          total_interactions?: number | null
          trust_level?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_memory_threads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "agent_memory_threads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_memory_threads_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_messages: {
        Row: {
          content: string
          context_objective_id: string | null
          context_task_id: string | null
          created_at: string
          foundry_id: string
          from_agent_id: string | null
          from_agent_name: string
          id: string
          is_read: boolean | null
          message_type: string
          metadata: Json | null
          to_agent_id: string | null
          to_agent_name: string | null
        }
        Insert: {
          content: string
          context_objective_id?: string | null
          context_task_id?: string | null
          created_at?: string
          foundry_id: string
          from_agent_id?: string | null
          from_agent_name: string
          id?: string
          is_read?: boolean | null
          message_type?: string
          metadata?: Json | null
          to_agent_id?: string | null
          to_agent_name?: string | null
        }
        Update: {
          content?: string
          context_objective_id?: string | null
          context_task_id?: string | null
          created_at?: string
          foundry_id?: string
          from_agent_id?: string | null
          from_agent_name?: string
          id?: string
          is_read?: boolean | null
          message_type?: string
          metadata?: Json | null
          to_agent_id?: string | null
          to_agent_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_messages_context_objective_id_fkey"
            columns: ["context_objective_id"]
            isOneToOne: false
            referencedRelation: "objectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_messages_context_task_id_fkey"
            columns: ["context_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_messages_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_messages_from_agent_id_fkey"
            columns: ["from_agent_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "agent_messages_from_agent_id_fkey"
            columns: ["from_agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_messages_to_agent_id_fkey"
            columns: ["to_agent_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "agent_messages_to_agent_id_fkey"
            columns: ["to_agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_permission_tiers: {
        Row: {
          can_block: boolean | null
          created_at: string
          description: string | null
          id: string
          requires_approval: boolean | null
          requires_explicit_approval: boolean | null
          requires_human_review: boolean | null
          tier_level: number
          tier_name: string
        }
        Insert: {
          can_block?: boolean | null
          created_at?: string
          description?: string | null
          id?: string
          requires_approval?: boolean | null
          requires_explicit_approval?: boolean | null
          requires_human_review?: boolean | null
          tier_level: number
          tier_name: string
        }
        Update: {
          can_block?: boolean | null
          created_at?: string
          description?: string | null
          id?: string
          requires_approval?: boolean | null
          requires_explicit_approval?: boolean | null
          requires_human_review?: boolean | null
          tier_level?: number
          tier_name?: string
        }
        Relationships: []
      }
      agent_rollouts: {
        Row: {
          agent_id: string
          created_at: string
          foundry_id: string
          id: string
          metadata: Json | null
          prompt_id: string | null
          reward: number | null
          reward_source: string | null
          rewarded_at: string | null
          status: string
          thread_id: string | null
          user_id: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          foundry_id: string
          id?: string
          metadata?: Json | null
          prompt_id?: string | null
          reward?: number | null
          reward_source?: string | null
          rewarded_at?: string | null
          status?: string
          thread_id?: string | null
          user_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          foundry_id?: string
          id?: string
          metadata?: Json | null
          prompt_id?: string | null
          reward?: number | null
          reward_source?: string | null
          rewarded_at?: string | null
          status?: string
          thread_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_rollouts_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_spans: {
        Row: {
          completion_tokens: number | null
          created_at: string
          id: string
          kind: string
          metadata: Json | null
          prompt_snapshot: string | null
          prompt_tokens: number | null
          response_snapshot: string | null
          rollout_id: string
        }
        Insert: {
          completion_tokens?: number | null
          created_at?: string
          id?: string
          kind?: string
          metadata?: Json | null
          prompt_snapshot?: string | null
          prompt_tokens?: number | null
          response_snapshot?: string | null
          rollout_id: string
        }
        Update: {
          completion_tokens?: number | null
          created_at?: string
          id?: string
          kind?: string
          metadata?: Json | null
          prompt_snapshot?: string | null
          prompt_tokens?: number | null
          response_snapshot?: string | null
          rollout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_spans_rollout_id_fkey"
            columns: ["rollout_id"]
            isOneToOne: false
            referencedRelation: "agent_rollouts"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_sweep_log: {
        Row: {
          completed_at: string | null
          duration_ms: number
          error_message: string | null
          estimated_cost_usd: number
          foundry_id: string
          id: string
          insights_generated: number
          specialist_id: string
          started_at: string
          status: string
          tokens_in: number
          tokens_out: number
        }
        Insert: {
          completed_at?: string | null
          duration_ms?: number
          error_message?: string | null
          estimated_cost_usd?: number
          foundry_id: string
          id?: string
          insights_generated?: number
          specialist_id: string
          started_at?: string
          status?: string
          tokens_in?: number
          tokens_out?: number
        }
        Update: {
          completed_at?: string | null
          duration_ms?: number
          error_message?: string | null
          estimated_cost_usd?: number
          foundry_id?: string
          id?: string
          insights_generated?: number
          specialist_id?: string
          started_at?: string
          status?: string
          tokens_in?: number
          tokens_out?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_sweep_log_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_workflow_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          foundry_id: string
          id: string
          node_count: number
          node_outputs: Json
          nodes_completed: number
          run_by: string | null
          started_at: string
          status: string
          workflow_id: string | null
          workflow_name: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          foundry_id: string
          id?: string
          node_count?: number
          node_outputs?: Json
          nodes_completed?: number
          run_by?: string | null
          started_at?: string
          status?: string
          workflow_id?: string | null
          workflow_name?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          foundry_id?: string
          id?: string
          node_count?: number
          node_outputs?: Json
          nodes_completed?: number
          run_by?: string | null
          started_at?: string
          status?: string
          workflow_id?: string | null
          workflow_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_workflow_runs_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_workflow_runs_run_by_fkey"
            columns: ["run_by"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "agent_workflow_runs_run_by_fkey"
            columns: ["run_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_workflow_runs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "agent_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_workflows: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          edges: Json
          foundry_id: string
          id: string
          is_template: boolean
          name: string
          nodes: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          edges?: Json
          foundry_id: string
          id?: string
          is_template?: boolean
          name?: string
          nodes?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          edges?: Json
          foundry_id?: string
          id?: string
          is_template?: boolean
          name?: string
          nodes?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_workflows_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "agent_workflows_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_workflows_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_provider_keys: {
        Row: {
          created_at: string
          encrypted_key: string
          id: string
          key_hint: string
          provider_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          encrypted_key: string
          id?: string
          key_hint?: string
          provider_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          encrypted_key?: string
          id?: string
          key_hint?: string
          provider_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_provider_preferences: {
        Row: {
          created_at: string
          id: string
          modality: string
          model_id: string
          provider_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          modality: string
          model_id: string
          provider_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          modality?: string
          model_id?: string
          provider_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_spending_caps: {
        Row: {
          alert_sent: boolean | null
          alert_threshold_percent: number
          created_at: string | null
          current_month_spending_pence: number
          current_period_start: string
          foundry_id: string
          id: string
          last_reset_at: string | null
          monthly_cap_pence: number
          updated_at: string | null
        }
        Insert: {
          alert_sent?: boolean | null
          alert_threshold_percent?: number
          created_at?: string | null
          current_month_spending_pence?: number
          current_period_start?: string
          foundry_id: string
          id?: string
          last_reset_at?: string | null
          monthly_cap_pence?: number
          updated_at?: string | null
        }
        Update: {
          alert_sent?: boolean | null
          alert_threshold_percent?: number
          created_at?: string | null
          current_month_spending_pence?: number
          current_period_start?: string
          foundry_id?: string
          id?: string
          last_reset_at?: string | null
          monthly_cap_pence?: number
          updated_at?: string | null
        }
        Relationships: []
      }
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
      ai_usage: {
        Row: {
          completion_tokens: number
          created_at: string | null
          error_message: string | null
          estimated_cost_pence: number
          foundry_id: string
          id: string
          model: string
          operation_type: string
          prompt_tokens: number
          request_duration_ms: number | null
          success: boolean | null
          task_id: string | null
          total_tokens: number
          user_id: string | null
        }
        Insert: {
          completion_tokens?: number
          created_at?: string | null
          error_message?: string | null
          estimated_cost_pence?: number
          foundry_id: string
          id?: string
          model: string
          operation_type: string
          prompt_tokens?: number
          request_duration_ms?: number | null
          success?: boolean | null
          task_id?: string | null
          total_tokens?: number
          user_id?: string | null
        }
        Update: {
          completion_tokens?: number
          created_at?: string | null
          error_message?: string | null
          estimated_cost_pence?: number
          foundry_id?: string
          id?: string
          model?: string
          operation_type?: string
          prompt_tokens?: number
          request_duration_ms?: number | null
          success?: boolean | null
          task_id?: string | null
          total_tokens?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "ai_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_log: {
        Row: {
          completion_tokens: number
          created_at: string
          estimated_cost_usd: number
          feature: string
          foundry_id: string
          id: string
          key_source: string
          metadata: Json | null
          model: string
          prompt_tokens: number
          total_tokens: number
          user_id: string
        }
        Insert: {
          completion_tokens?: number
          created_at?: string
          estimated_cost_usd?: number
          feature: string
          foundry_id: string
          id?: string
          key_source?: string
          metadata?: Json | null
          model?: string
          prompt_tokens?: number
          total_tokens?: number
          user_id: string
        }
        Update: {
          completion_tokens?: number
          created_at?: string
          estimated_cost_usd?: number
          feature?: string
          foundry_id?: string
          id?: string
          key_source?: string
          metadata?: Json | null
          model?: string
          prompt_tokens?: number
          total_tokens?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_log_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "ai_usage_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_monthly: {
        Row: {
          created_at: string
          foundry_id: string
          id: string
          month_year: string
          total_ai_tasks: number
          total_cost_usd: number
          total_tokens: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          foundry_id: string
          id?: string
          month_year: string
          total_ai_tasks?: number
          total_cost_usd?: number
          total_tokens?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          foundry_id?: string
          id?: string
          month_year?: string
          total_ai_tasks?: number
          total_cost_usd?: number
          total_tokens?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_monthly_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
        ]
      }
      apprentice_skill_assessments: {
        Row: {
          assessed_at: string | null
          assessed_by: string | null
          assessment_method: string | null
          assessor_notes: string | null
          created_at: string | null
          current_level: number | null
          development_plan: string | null
          enrollment_id: string
          evidence: string | null
          evidence_urls: Json | null
          id: string
          skill_id: string
          target_level: number | null
          updated_at: string | null
        }
        Insert: {
          assessed_at?: string | null
          assessed_by?: string | null
          assessment_method?: string | null
          assessor_notes?: string | null
          created_at?: string | null
          current_level?: number | null
          development_plan?: string | null
          enrollment_id: string
          evidence?: string | null
          evidence_urls?: Json | null
          id?: string
          skill_id: string
          target_level?: number | null
          updated_at?: string | null
        }
        Update: {
          assessed_at?: string | null
          assessed_by?: string | null
          assessment_method?: string | null
          assessor_notes?: string | null
          created_at?: string | null
          current_level?: number | null
          development_plan?: string | null
          enrollment_id?: string
          evidence?: string | null
          evidence_urls?: Json | null
          id?: string
          skill_id?: string
          target_level?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "apprentice_skill_assessments_assessed_by_fkey"
            columns: ["assessed_by"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "apprentice_skill_assessments_assessed_by_fkey"
            columns: ["assessed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apprentice_skill_assessments_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "apprenticeship_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apprentice_skill_assessments_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "apprenticeship_skills"
            referencedColumns: ["id"]
          },
        ]
      }
      apprenticeship_documents: {
        Row: {
          content: Json | null
          created_at: string | null
          created_by: string | null
          description: string | null
          document_type: string
          enrollment_id: string
          file_url: string | null
          id: string
          requires_signatures: Json | null
          signatures: Json | null
          status: string | null
          superseded_by: string | null
          template_version: string | null
          title: string
          updated_at: string | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          content?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          document_type: string
          enrollment_id: string
          file_url?: string | null
          id?: string
          requires_signatures?: Json | null
          signatures?: Json | null
          status?: string | null
          superseded_by?: string | null
          template_version?: string | null
          title: string
          updated_at?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          content?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          document_type?: string
          enrollment_id?: string
          file_url?: string | null
          id?: string
          requires_signatures?: Json | null
          signatures?: Json | null
          status?: string | null
          superseded_by?: string | null
          template_version?: string | null
          title?: string
          updated_at?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "apprenticeship_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "apprenticeship_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apprenticeship_documents_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "apprenticeship_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apprenticeship_documents_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "apprenticeship_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      apprenticeship_enrollments: {
        Row: {
          actual_end_date: string | null
          agreement_signed_at: string | null
          apprentice_id: string
          commitment_statement_signed_at: string | null
          created_at: string | null
          employment_type: string | null
          expected_end_date: string
          flying_start_date: string | null
          foundry_id: string
          hourly_rate: number | null
          id: string
          notes: string | null
          otjt_hours_logged: number | null
          otjt_hours_target: number
          programme_id: string
          senior_mentor_id: string | null
          start_date: string
          status: string | null
          training_plan_approved_at: string | null
          updated_at: string | null
          wage_band: string | null
          weekly_hours: number | null
          workplace_buddy_id: string | null
        }
        Insert: {
          actual_end_date?: string | null
          agreement_signed_at?: string | null
          apprentice_id: string
          commitment_statement_signed_at?: string | null
          created_at?: string | null
          employment_type?: string | null
          expected_end_date: string
          flying_start_date?: string | null
          foundry_id: string
          hourly_rate?: number | null
          id?: string
          notes?: string | null
          otjt_hours_logged?: number | null
          otjt_hours_target: number
          programme_id: string
          senior_mentor_id?: string | null
          start_date: string
          status?: string | null
          training_plan_approved_at?: string | null
          updated_at?: string | null
          wage_band?: string | null
          weekly_hours?: number | null
          workplace_buddy_id?: string | null
        }
        Update: {
          actual_end_date?: string | null
          agreement_signed_at?: string | null
          apprentice_id?: string
          commitment_statement_signed_at?: string | null
          created_at?: string | null
          employment_type?: string | null
          expected_end_date?: string
          flying_start_date?: string | null
          foundry_id?: string
          hourly_rate?: number | null
          id?: string
          notes?: string | null
          otjt_hours_logged?: number | null
          otjt_hours_target?: number
          programme_id?: string
          senior_mentor_id?: string | null
          start_date?: string
          status?: string | null
          training_plan_approved_at?: string | null
          updated_at?: string | null
          wage_band?: string | null
          weekly_hours?: number | null
          workplace_buddy_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "apprenticeship_enrollments_apprentice_id_fkey"
            columns: ["apprentice_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "apprenticeship_enrollments_apprentice_id_fkey"
            columns: ["apprentice_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apprenticeship_enrollments_programme_id_fkey"
            columns: ["programme_id"]
            isOneToOne: false
            referencedRelation: "apprenticeship_programmes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apprenticeship_enrollments_senior_mentor_id_fkey"
            columns: ["senior_mentor_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "apprenticeship_enrollments_senior_mentor_id_fkey"
            columns: ["senior_mentor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apprenticeship_enrollments_workplace_buddy_id_fkey"
            columns: ["workplace_buddy_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "apprenticeship_enrollments_workplace_buddy_id_fkey"
            columns: ["workplace_buddy_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      apprenticeship_programmes: {
        Row: {
          assessment_plan: Json | null
          created_at: string | null
          description: string | null
          duration_months: number
          id: string
          is_active: boolean | null
          learning_outcomes: Json | null
          level: number | null
          otjt_hours_required: number
          skills_framework: Json | null
          standard_code: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          assessment_plan?: Json | null
          created_at?: string | null
          description?: string | null
          duration_months: number
          id?: string
          is_active?: boolean | null
          learning_outcomes?: Json | null
          level?: number | null
          otjt_hours_required: number
          skills_framework?: Json | null
          standard_code?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          assessment_plan?: Json | null
          created_at?: string | null
          description?: string | null
          duration_months?: number
          id?: string
          is_active?: boolean | null
          learning_outcomes?: Json | null
          level?: number | null
          otjt_hours_required?: number
          skills_framework?: Json | null
          standard_code?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      apprenticeship_skills: {
        Row: {
          category: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          level_1_description: string | null
          level_2_description: string | null
          level_3_description: string | null
          level_4_description: string | null
          level_5_description: string | null
          name: string
          parent_skill_id: string | null
          programme_ids: string[] | null
        }
        Insert: {
          category: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          level_1_description?: string | null
          level_2_description?: string | null
          level_3_description?: string | null
          level_4_description?: string | null
          level_5_description?: string | null
          name: string
          parent_skill_id?: string | null
          programme_ids?: string[] | null
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          level_1_description?: string | null
          level_2_description?: string | null
          level_3_description?: string | null
          level_4_description?: string | null
          level_5_description?: string | null
          name?: string
          parent_skill_id?: string | null
          programme_ids?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "apprenticeship_skills_parent_skill_id_fkey"
            columns: ["parent_skill_id"]
            isOneToOne: false
            referencedRelation: "apprenticeship_skills"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
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
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
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
      assembly_templates: {
        Row: {
          category: string
          created_at: string
          default_stats: Json
          description: string
          difficulty: string
          id: string
          name: string
          schematic_svg: string | null
          sector: string | null
          slots: Json
          slug: string
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          default_stats?: Json
          description?: string
          difficulty?: string
          id?: string
          name: string
          schematic_svg?: string | null
          sector?: string | null
          slots?: Json
          slug: string
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          default_stats?: Json
          description?: string
          difficulty?: string
          id?: string
          name?: string
          schematic_svg?: string | null
          sector?: string | null
          slots?: Json
          slug?: string
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      availability_slots: {
        Row: {
          booking_id: string | null
          created_at: string | null
          date: string
          id: string
          provider_id: string
          source: string | null
          status: string | null
        }
        Insert: {
          booking_id?: string | null
          created_at?: string | null
          date: string
          id?: string
          provider_id: string
          source?: string | null
          status?: string | null
        }
        Update: {
          booking_id?: string | null
          created_at?: string | null
          date?: string
          id?: string
          provider_id?: string
          source?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "availability_slots_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "provider_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_slots_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "provider_stats"
            referencedColumns: ["provider_id"]
          },
          {
            foreignKeyName: "availability_slots_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "supplier_search_ranking"
            referencedColumns: ["provider_id"]
          },
        ]
      }
      balance_transactions: {
        Row: {
          amount: number
          balance_after: number
          balance_before: number
          created_at: string | null
          description: string | null
          id: string
          reference_id: string | null
          reference_type: string | null
          stripe_payment_intent_id: string | null
          transaction_type: string
          user_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          balance_before: number
          created_at?: string | null
          description?: string | null
          id?: string
          reference_id?: string | null
          reference_type?: string | null
          stripe_payment_intent_id?: string | null
          transaction_type: string
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          balance_before?: number
          created_at?: string | null
          description?: string | null
          id?: string
          reference_id?: string | null
          reference_type?: string | null
          stripe_payment_intent_id?: string | null
          transaction_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "balance_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "balance_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transfer_requests: {
        Row: {
          amount: number
          bank_transfer_instructions: Json | null
          completed_at: string | null
          created_at: string | null
          currency: string | null
          expires_at: string | null
          id: string
          reference_number: string | null
          status: string | null
          stripe_payment_intent_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          bank_transfer_instructions?: Json | null
          completed_at?: string | null
          created_at?: string | null
          currency?: string | null
          expires_at?: string | null
          id?: string
          reference_number?: string | null
          status?: string | null
          stripe_payment_intent_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          bank_transfer_instructions?: Json | null
          completed_at?: string | null
          created_at?: string | null
          currency?: string | null
          expires_at?: string | null
          id?: string
          reference_number?: string | null
          status?: string | null
          stripe_payment_intent_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_transfer_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "bank_transfer_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      blueprint_domain_coverage: {
        Row: {
          blockers: string[] | null
          blueprint_id: string
          decisions: Json | null
          domain_id: string
          domain_name: string | null
          domain_path: string | null
          foundry_id: string
          id: string
          is_critical: boolean | null
          notes: string | null
          questions_answered: Json | null
          questions_open: Json | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          blockers?: string[] | null
          blueprint_id: string
          decisions?: Json | null
          domain_id: string
          domain_name?: string | null
          domain_path?: string | null
          foundry_id: string
          id?: string
          is_critical?: boolean | null
          notes?: string | null
          questions_answered?: Json | null
          questions_open?: Json | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          blockers?: string[] | null
          blueprint_id?: string
          decisions?: Json | null
          domain_id?: string
          domain_name?: string | null
          domain_path?: string | null
          foundry_id?: string
          id?: string
          is_critical?: boolean | null
          notes?: string | null
          questions_answered?: Json | null
          questions_open?: Json | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blueprint_domain_coverage_blueprint_id_fkey"
            columns: ["blueprint_id"]
            isOneToOne: false
            referencedRelation: "blueprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blueprint_domain_coverage_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "knowledge_domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blueprint_domain_coverage_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
        ]
      }
      blueprint_expertise: {
        Row: {
          availability: Json | null
          confidence: number | null
          coverage_id: string
          created_at: string | null
          expertise_level: string | null
          external_contact: Json | null
          id: string
          marketplace_listing_id: string | null
          notes: string | null
          person_type: string
          profile_id: string | null
          specific_skills: string[] | null
          verification_status: string | null
        }
        Insert: {
          availability?: Json | null
          confidence?: number | null
          coverage_id: string
          created_at?: string | null
          expertise_level?: string | null
          external_contact?: Json | null
          id?: string
          marketplace_listing_id?: string | null
          notes?: string | null
          person_type: string
          profile_id?: string | null
          specific_skills?: string[] | null
          verification_status?: string | null
        }
        Update: {
          availability?: Json | null
          confidence?: number | null
          coverage_id?: string
          created_at?: string | null
          expertise_level?: string | null
          external_contact?: Json | null
          id?: string
          marketplace_listing_id?: string | null
          notes?: string | null
          person_type?: string
          profile_id?: string | null
          specific_skills?: string[] | null
          verification_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blueprint_expertise_coverage_id_fkey"
            columns: ["coverage_id"]
            isOneToOne: false
            referencedRelation: "blueprint_domain_coverage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blueprint_expertise_marketplace_listing_id_fkey"
            columns: ["marketplace_listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blueprint_expertise_marketplace_listing_id_fkey"
            columns: ["marketplace_listing_id"]
            isOneToOne: false
            referencedRelation: "supplier_search_ranking"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "blueprint_expertise_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "blueprint_expertise_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      blueprint_history: {
        Row: {
          action: string
          blueprint_id: string
          created_at: string | null
          details: Json | null
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          blueprint_id: string
          created_at?: string | null
          details?: Json | null
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          blueprint_id?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blueprint_history_blueprint_id_fkey"
            columns: ["blueprint_id"]
            isOneToOne: false
            referencedRelation: "blueprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blueprint_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "blueprint_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      blueprint_milestones: {
        Row: {
          blueprint_id: string
          completed_at: string | null
          created_at: string | null
          description: string | null
          display_order: number | null
          id: string
          name: string
          required_domain_ids: string[] | null
          status: string | null
          target_date: string | null
        }
        Insert: {
          blueprint_id: string
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          name: string
          required_domain_ids?: string[] | null
          status?: string | null
          target_date?: string | null
        }
        Update: {
          blueprint_id?: string
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          name?: string
          required_domain_ids?: string[] | null
          status?: string | null
          target_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blueprint_milestones_blueprint_id_fkey"
            columns: ["blueprint_id"]
            isOneToOne: false
            referencedRelation: "blueprints"
            referencedColumns: ["id"]
          },
        ]
      }
      blueprint_subsystem_mapping: {
        Row: {
          context_notes: string | null
          created_at: string
          display_order: number | null
          id: string
          relevance: string | null
          subsystem_id: string
          template_id: string
        }
        Insert: {
          context_notes?: string | null
          created_at?: string
          display_order?: number | null
          id?: string
          relevance?: string | null
          subsystem_id: string
          template_id: string
        }
        Update: {
          context_notes?: string | null
          created_at?: string
          display_order?: number | null
          id?: string
          relevance?: string | null
          subsystem_id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blueprint_subsystem_mapping_subsystem_id_fkey"
            columns: ["subsystem_id"]
            isOneToOne: false
            referencedRelation: "universal_subsystems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blueprint_subsystem_mapping_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "blueprint_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      blueprint_suppliers: {
        Row: {
          blueprint_id: string
          contact_history: Json | null
          created_at: string | null
          domain_categories: string[] | null
          id: string
          notes: string | null
          quotes: Json | null
          role: string | null
          status: string | null
          supplier_id: string
        }
        Insert: {
          blueprint_id: string
          contact_history?: Json | null
          created_at?: string | null
          domain_categories?: string[] | null
          id?: string
          notes?: string | null
          quotes?: Json | null
          role?: string | null
          status?: string | null
          supplier_id: string
        }
        Update: {
          blueprint_id?: string
          contact_history?: Json | null
          created_at?: string | null
          domain_categories?: string[] | null
          id?: string
          notes?: string | null
          quotes?: Json | null
          role?: string | null
          status?: string | null
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blueprint_suppliers_blueprint_id_fkey"
            columns: ["blueprint_id"]
            isOneToOne: false
            referencedRelation: "blueprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blueprint_suppliers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      blueprint_templates: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          estimated_domains: number | null
          estimated_questions: number | null
          fork_count: number | null
          icon: string | null
          id: string
          is_system_template: boolean | null
          metadata: Json | null
          name: string
          product_category: string
          updated_at: string | null
          use_count: number | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          estimated_domains?: number | null
          estimated_questions?: number | null
          fork_count?: number | null
          icon?: string | null
          id?: string
          is_system_template?: boolean | null
          metadata?: Json | null
          name: string
          product_category: string
          updated_at?: string | null
          use_count?: number | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          estimated_domains?: number | null
          estimated_questions?: number | null
          fork_count?: number | null
          icon?: string | null
          id?: string
          is_system_template?: boolean | null
          metadata?: Json | null
          name?: string
          product_category?: string
          updated_at?: string | null
          use_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "blueprint_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "blueprint_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      blueprints: {
        Row: {
          ai_generated_context: Json | null
          coverage_score: number | null
          covered_domains: number | null
          created_at: string | null
          created_by: string | null
          critical_gaps: number | null
          description: string | null
          foundry_id: string
          id: string
          name: string
          project_stage: string | null
          project_type: string | null
          settings: Json | null
          status: string | null
          template_id: string | null
          total_domains: number | null
          updated_at: string | null
        }
        Insert: {
          ai_generated_context?: Json | null
          coverage_score?: number | null
          covered_domains?: number | null
          created_at?: string | null
          created_by?: string | null
          critical_gaps?: number | null
          description?: string | null
          foundry_id: string
          id?: string
          name: string
          project_stage?: string | null
          project_type?: string | null
          settings?: Json | null
          status?: string | null
          template_id?: string | null
          total_domains?: number | null
          updated_at?: string | null
        }
        Update: {
          ai_generated_context?: Json | null
          coverage_score?: number | null
          covered_domains?: number | null
          created_at?: string | null
          created_by?: string | null
          critical_gaps?: number | null
          description?: string | null
          foundry_id?: string
          id?: string
          name?: string
          project_stage?: string | null
          project_type?: string | null
          settings?: Json | null
          status?: string | null
          template_id?: string | null
          total_domains?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blueprints_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "blueprints_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blueprints_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blueprints_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "blueprint_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      business_functions: {
        Row: {
          category: string
          created_at: string | null
          description: string | null
          display_order: number | null
          id: string
          is_critical: boolean | null
          name: string
          typical_roles: string[] | null
        }
        Insert: {
          category: string
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_critical?: boolean | null
          name: string
          typical_roles?: string[] | null
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_critical?: boolean | null
          name?: string
          typical_roles?: string[] | null
        }
        Relationships: []
      }
      business_plan_analyses: {
        Row: {
          analysis_json: Json
          analyzed_at: string
          created_at: string
          created_by: string | null
          file_name: string | null
          foundry_id: string
          id: string
        }
        Insert: {
          analysis_json?: Json
          analyzed_at?: string
          created_at?: string
          created_by?: string | null
          file_name?: string | null
          foundry_id: string
          id?: string
        }
        Update: {
          analysis_json?: Json
          analyzed_at?: string
          created_at?: string
          created_by?: string | null
          file_name?: string | null
          foundry_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_plan_analyses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "business_plan_analyses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_plan_analyses_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
        ]
      }
      cad_assemblies: {
        Row: {
          assembly_params: Json | null
          bounding_box: Json | null
          created_at: string | null
          creator_id: string | null
          description: string | null
          id: string
          name: string
          rfq_id: string | null
          status: string | null
          step_file_url: string | null
          stl_file_url: string | null
          thumbnail_url: string | null
          updated_at: string | null
        }
        Insert: {
          assembly_params?: Json | null
          bounding_box?: Json | null
          created_at?: string | null
          creator_id?: string | null
          description?: string | null
          id?: string
          name: string
          rfq_id?: string | null
          status?: string | null
          step_file_url?: string | null
          stl_file_url?: string | null
          thumbnail_url?: string | null
          updated_at?: string | null
        }
        Update: {
          assembly_params?: Json | null
          bounding_box?: Json | null
          created_at?: string | null
          creator_id?: string | null
          description?: string | null
          id?: string
          name?: string
          rfq_id?: string | null
          status?: string | null
          step_file_url?: string | null
          stl_file_url?: string | null
          thumbnail_url?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cad_assemblies_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
        ]
      }
      cad_grammar_versions: {
        Row: {
          change_summary: string | null
          core_library_code: string | null
          created_at: string
          created_by: string | null
          defaults: Json | null
          grammar_id: string
          id: string
          param_specs: Json | null
          python_code: string
          version: number
        }
        Insert: {
          change_summary?: string | null
          core_library_code?: string | null
          created_at?: string
          created_by?: string | null
          defaults?: Json | null
          grammar_id: string
          id?: string
          param_specs?: Json | null
          python_code: string
          version: number
        }
        Update: {
          change_summary?: string | null
          core_library_code?: string | null
          created_at?: string
          created_by?: string | null
          defaults?: Json | null
          grammar_id?: string
          id?: string
          param_specs?: Json | null
          python_code?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "cad_grammar_versions_grammar_id_fkey"
            columns: ["grammar_id"]
            isOneToOne: false
            referencedRelation: "cad_grammars"
            referencedColumns: ["id"]
          },
        ]
      }
      cad_grammars: {
        Row: {
          constraints_summary: string | null
          core_library_code: string | null
          created_at: string
          defaults: Json
          deprecation_notice: string | null
          description: string
          display_name: string
          domain_keywords: string[]
          example_prompts: string[]
          id: string
          is_active: boolean
          name: string
          param_specs: Json
          previous_version_id: string | null
          python_code: string
          research_references: Json | null
          source: string
          updated_at: string
          version: number
        }
        Insert: {
          constraints_summary?: string | null
          core_library_code?: string | null
          created_at?: string
          defaults?: Json
          deprecation_notice?: string | null
          description: string
          display_name: string
          domain_keywords?: string[]
          example_prompts?: string[]
          id?: string
          is_active?: boolean
          name: string
          param_specs?: Json
          previous_version_id?: string | null
          python_code: string
          research_references?: Json | null
          source?: string
          updated_at?: string
          version?: number
        }
        Update: {
          constraints_summary?: string | null
          core_library_code?: string | null
          created_at?: string
          defaults?: Json
          deprecation_notice?: string | null
          description?: string
          display_name?: string
          domain_keywords?: string[]
          example_prompts?: string[]
          id?: string
          is_active?: boolean
          name?: string
          param_specs?: Json
          previous_version_id?: string | null
          python_code?: string
          research_references?: Json | null
          source?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "cad_grammars_previous_version_id_fkey"
            columns: ["previous_version_id"]
            isOneToOne: false
            referencedRelation: "cad_grammar_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      cad_lab_projects: {
        Row: {
          batch_started_at: string | null
          batch_status: string
          created_at: string
          created_by: string
          foundry_id: string
          generated_code: string | null
          id: string
          integrated_assembly_step_url: string | null
          integrated_assembly_stl_url: string | null
          interface_definition: string | null
          model_id: string
          modules: Json | null
          name: string
          research: Json | null
          result: Json | null
          stage: string
          status: string
          subject: string
          thumbnail_svg: string | null
          updated_at: string
        }
        Insert: {
          batch_started_at?: string | null
          batch_status?: string
          created_at?: string
          created_by: string
          foundry_id: string
          generated_code?: string | null
          id?: string
          integrated_assembly_step_url?: string | null
          integrated_assembly_stl_url?: string | null
          interface_definition?: string | null
          model_id?: string
          modules?: Json | null
          name?: string
          research?: Json | null
          result?: Json | null
          stage?: string
          status?: string
          subject: string
          thumbnail_svg?: string | null
          updated_at?: string
        }
        Update: {
          batch_started_at?: string | null
          batch_status?: string
          created_at?: string
          created_by?: string
          foundry_id?: string
          generated_code?: string | null
          id?: string
          integrated_assembly_step_url?: string | null
          integrated_assembly_stl_url?: string | null
          interface_definition?: string | null
          model_id?: string
          modules?: Json | null
          name?: string
          research?: Json | null
          result?: Json | null
          stage?: string
          status?: string
          subject?: string
          thumbnail_svg?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      calendar_sync_mappings: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          foundry_id: string
          google_calendar_id: string
          google_event_id: string
          id: string
          last_synced_at: string
          sync_direction: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          foundry_id: string
          google_calendar_id?: string
          google_event_id: string
          id?: string
          last_synced_at?: string
          sync_direction?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          foundry_id?: string
          google_calendar_id?: string
          google_event_id?: string
          id?: string
          last_synced_at?: string
          sync_direction?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_sync_mappings_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
        ]
      }
      case_studies: {
        Row: {
          approach: string
          challenge: string
          client_industry: string | null
          client_logo_url: string | null
          client_name: string | null
          company_stage: string | null
          created_at: string | null
          display_order: number | null
          end_date: string | null
          engagement_type: string | null
          hours_per_week: number | null
          id: string
          is_featured: boolean | null
          is_public: boolean | null
          metrics: Json | null
          outcome: string
          provider_id: string
          start_date: string | null
          testimonial_author: string | null
          testimonial_quote: string | null
          testimonial_role: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          approach: string
          challenge: string
          client_industry?: string | null
          client_logo_url?: string | null
          client_name?: string | null
          company_stage?: string | null
          created_at?: string | null
          display_order?: number | null
          end_date?: string | null
          engagement_type?: string | null
          hours_per_week?: number | null
          id?: string
          is_featured?: boolean | null
          is_public?: boolean | null
          metrics?: Json | null
          outcome: string
          provider_id: string
          start_date?: string | null
          testimonial_author?: string | null
          testimonial_quote?: string | null
          testimonial_role?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          approach?: string
          challenge?: string
          client_industry?: string | null
          client_logo_url?: string | null
          client_name?: string | null
          company_stage?: string | null
          created_at?: string | null
          display_order?: number | null
          end_date?: string | null
          engagement_type?: string | null
          hours_per_week?: number | null
          id?: string
          is_featured?: boolean | null
          is_public?: boolean | null
          metrics?: Json | null
          outcome?: string
          provider_id?: string
          start_date?: string | null
          testimonial_author?: string | null
          testimonial_quote?: string | null
          testimonial_role?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_studies_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "provider_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_studies_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "provider_stats"
            referencedColumns: ["provider_id"]
          },
          {
            foreignKeyName: "case_studies_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "supplier_search_ranking"
            referencedColumns: ["provider_id"]
          },
        ]
      }
      company_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string | null
          email: string
          expires_at: string
          foundry_id: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["member_role"]
          token: string
          updated_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string | null
          email: string
          expires_at: string
          foundry_id: string
          id?: string
          invited_by: string
          role?: Database["public"]["Enums"]["member_role"]
          token: string
          updated_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string | null
          email?: string
          expires_at?: string
          foundry_id?: string
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["member_role"]
          token?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_invitations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "company_invitations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "company_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      component_catalogue: {
        Row: {
          colour_override: string | null
          created_at: string | null
          datasheet_extracted_at: string | null
          datasheet_specs: Json | null
          datasheet_url: string | null
          embedding: string | null
          geometry_params: Json
          geometry_type_slug: string
          id: string
          manufacturer: string | null
          material: string | null
          mounting_points: Json | null
          name: string
          part_number: string | null
          sources: Json | null
          tags: string[] | null
          thumbnail_url: string | null
          updated_at: string | null
          verified: boolean | null
          weight_g: number | null
        }
        Insert: {
          colour_override?: string | null
          created_at?: string | null
          datasheet_extracted_at?: string | null
          datasheet_specs?: Json | null
          datasheet_url?: string | null
          embedding?: string | null
          geometry_params?: Json
          geometry_type_slug: string
          id?: string
          manufacturer?: string | null
          material?: string | null
          mounting_points?: Json | null
          name: string
          part_number?: string | null
          sources?: Json | null
          tags?: string[] | null
          thumbnail_url?: string | null
          updated_at?: string | null
          verified?: boolean | null
          weight_g?: number | null
        }
        Update: {
          colour_override?: string | null
          created_at?: string | null
          datasheet_extracted_at?: string | null
          datasheet_specs?: Json | null
          datasheet_url?: string | null
          embedding?: string | null
          geometry_params?: Json
          geometry_type_slug?: string
          id?: string
          manufacturer?: string | null
          material?: string | null
          mounting_points?: Json | null
          name?: string
          part_number?: string | null
          sources?: Json | null
          tags?: string[] | null
          thumbnail_url?: string | null
          updated_at?: string | null
          verified?: boolean | null
          weight_g?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "component_catalogue_geometry_type_slug_fkey"
            columns: ["geometry_type_slug"]
            isOneToOne: false
            referencedRelation: "component_geometry_types"
            referencedColumns: ["slug"]
          },
        ]
      }
      component_certifications: {
        Row: {
          certifications: Json
          compliance_summary: Json | null
          component_name: string
          created_at: string
          export_control: Json | null
          id: string
          manufacturer: string | null
          material_declarations: string[] | null
          regulatory_notes: string | null
        }
        Insert: {
          certifications?: Json
          compliance_summary?: Json | null
          component_name: string
          created_at?: string
          export_control?: Json | null
          id?: string
          manufacturer?: string | null
          material_declarations?: string[] | null
          regulatory_notes?: string | null
        }
        Update: {
          certifications?: Json
          compliance_summary?: Json | null
          component_name?: string
          created_at?: string
          export_control?: Json | null
          id?: string
          manufacturer?: string | null
          material_declarations?: string[] | null
          regulatory_notes?: string | null
        }
        Relationships: []
      }
      component_compatibility: {
        Row: {
          component_a: string
          component_a_category: string | null
          component_b: string
          component_b_category: string | null
          confidence: number | null
          created_at: string
          domain: string | null
          embedding: string | null
          id: string
          notes: string | null
          relationship: string
          source_url: string | null
        }
        Insert: {
          component_a: string
          component_a_category?: string | null
          component_b: string
          component_b_category?: string | null
          confidence?: number | null
          created_at?: string
          domain?: string | null
          embedding?: string | null
          id?: string
          notes?: string | null
          relationship: string
          source_url?: string | null
        }
        Update: {
          component_a?: string
          component_a_category?: string | null
          component_b?: string
          component_b_category?: string | null
          confidence?: number | null
          created_at?: string
          domain?: string | null
          embedding?: string | null
          id?: string
          notes?: string | null
          relationship?: string
          source_url?: string | null
        }
        Relationships: []
      }
      component_geometry_types: {
        Row: {
          bbox_expressions: Json
          cadquery_code: string
          category: string
          created_at: string | null
          data_source: string
          default_colour: string | null
          description: string | null
          id: string
          mounting_interfaces: Json
          name: string
          param_schema: Json
          physical_properties: Json
          preview_step_url: string | null
          preview_stl_url: string | null
          preview_svg: string | null
          procurement: Json
          slug: string
          tier: string
          updated_at: string | null
          verified: boolean | null
          version: number | null
          visual_tags: string[] | null
        }
        Insert: {
          bbox_expressions?: Json
          cadquery_code: string
          category: string
          created_at?: string | null
          data_source?: string
          default_colour?: string | null
          description?: string | null
          id?: string
          mounting_interfaces?: Json
          name: string
          param_schema?: Json
          physical_properties?: Json
          preview_step_url?: string | null
          preview_stl_url?: string | null
          preview_svg?: string | null
          procurement?: Json
          slug: string
          tier: string
          updated_at?: string | null
          verified?: boolean | null
          version?: number | null
          visual_tags?: string[] | null
        }
        Update: {
          bbox_expressions?: Json
          cadquery_code?: string
          category?: string
          created_at?: string | null
          data_source?: string
          default_colour?: string | null
          description?: string | null
          id?: string
          mounting_interfaces?: Json
          name?: string
          param_schema?: Json
          physical_properties?: Json
          preview_step_url?: string | null
          preview_stl_url?: string | null
          preview_svg?: string | null
          procurement?: Json
          slug?: string
          tier?: string
          updated_at?: string | null
          verified?: boolean | null
          version?: number | null
          visual_tags?: string[] | null
        }
        Relationships: []
      }
      component_pricing: {
        Row: {
          component_name: string
          created_at: string
          currency: string | null
          id: string
          last_verified: string | null
          lead_time_days: Json | null
          manufacturer: string | null
          moq: number | null
          pricing_tiers: Json
          shipping_notes: string | null
          updated_at: string
        }
        Insert: {
          component_name: string
          created_at?: string
          currency?: string | null
          id?: string
          last_verified?: string | null
          lead_time_days?: Json | null
          manufacturer?: string | null
          moq?: number | null
          pricing_tiers?: Json
          shipping_notes?: string | null
          updated_at?: string
        }
        Update: {
          component_name?: string
          created_at?: string
          currency?: string | null
          id?: string
          last_verified?: string | null
          lead_time_days?: Json | null
          manufacturer?: string | null
          moq?: number | null
          pricing_tiers?: Json
          shipping_notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      component_recommendations: {
        Row: {
          bundle_suggestion: Json | null
          created_at: string
          id: string
          primary_category: string | null
          primary_product: string
          recommendations: Json
        }
        Insert: {
          bundle_suggestion?: Json | null
          created_at?: string
          id?: string
          primary_category?: string | null
          primary_product: string
          recommendations?: Json
        }
        Update: {
          bundle_suggestion?: Json | null
          created_at?: string
          id?: string
          primary_category?: string | null
          primary_product?: string
          recommendations?: Json
        }
        Relationships: []
      }
      contract_templates: {
        Row: {
          content: string
          created_at: string | null
          id: string
          is_default: boolean | null
          name: string
          template_type: string
          variables: Json | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          template_type: string
          variables?: Json | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          template_type?: string
          variables?: Json | null
        }
        Relationships: []
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          id: string
          is_muted: boolean | null
          joined_at: string | null
          last_read_at: string | null
          profile_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          is_muted?: boolean | null
          joined_at?: string | null
          last_read_at?: string | null
          profile_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          is_muted?: boolean | null
          joined_at?: string | null
          last_read_at?: string | null
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "conversation_participants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          buyer_id: string
          conversation_type:
            | Database["public"]["Enums"]["conversation_type"]
            | null
          created_at: string | null
          creator_id: string | null
          id: string
          is_group: boolean | null
          listing_id: string | null
          objective_id: string | null
          order_id: string | null
          rfq_id: string | null
          seller_id: string
          status: string | null
          task_id: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          buyer_id: string
          conversation_type?:
            | Database["public"]["Enums"]["conversation_type"]
            | null
          created_at?: string | null
          creator_id?: string | null
          id?: string
          is_group?: boolean | null
          listing_id?: string | null
          objective_id?: string | null
          order_id?: string | null
          rfq_id?: string | null
          seller_id: string
          status?: string | null
          task_id?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          buyer_id?: string
          conversation_type?:
            | Database["public"]["Enums"]["conversation_type"]
            | null
          created_at?: string | null
          creator_id?: string | null
          id?: string
          is_group?: boolean | null
          listing_id?: string | null
          objective_id?: string | null
          order_id?: string | null
          rfq_id?: string | null
          seller_id?: string
          status?: string | null
          task_id?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "conversations_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "conversations_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "supplier_search_ranking"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "conversations_objective_id_fkey"
            columns: ["objective_id"]
            isOneToOne: false
            referencedRelation: "objectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "conversations_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      currency_exchange_rates: {
        Row: {
          base_currency: string
          expires_at: string | null
          fetched_at: string | null
          id: string
          rate: number
          target_currency: string
        }
        Insert: {
          base_currency: string
          expires_at?: string | null
          fetched_at?: string | null
          id?: string
          rate: number
          target_currency: string
        }
        Update: {
          base_currency?: string
          expires_at?: string | null
          fetched_at?: string | null
          id?: string
          rate?: number
          target_currency?: string
        }
        Relationships: []
      }
      custom_slash_commands: {
        Row: {
          action_config: Json
          action_type: string
          created_at: string | null
          created_by: string | null
          description: string
          enabled: boolean | null
          foundry_id: string
          icon: string | null
          id: string
          name: string
          required_roles: string[] | null
          updated_at: string | null
          usage: string | null
        }
        Insert: {
          action_config?: Json
          action_type: string
          created_at?: string | null
          created_by?: string | null
          description: string
          enabled?: boolean | null
          foundry_id: string
          icon?: string | null
          id?: string
          name: string
          required_roles?: string[] | null
          updated_at?: string | null
          usage?: string | null
        }
        Update: {
          action_config?: Json
          action_type?: string
          created_at?: string | null
          created_by?: string | null
          description?: string
          enabled?: boolean | null
          foundry_id?: string
          icon?: string | null
          id?: string
          name?: string
          required_roles?: string[] | null
          updated_at?: string | null
          usage?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_slash_commands_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "custom_slash_commands_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_slash_commands_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
        ]
      }
      data_requests: {
        Row: {
          completed_at: string | null
          created_at: string | null
          export_url: string | null
          id: string
          processed_by: string | null
          reason: string | null
          request_type: Database["public"]["Enums"]["data_request_type"]
          status: Database["public"]["Enums"]["data_request_status"] | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          export_url?: string | null
          id?: string
          processed_by?: string | null
          reason?: string | null
          request_type: Database["public"]["Enums"]["data_request_type"]
          status?: Database["public"]["Enums"]["data_request_status"] | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          export_url?: string | null
          id?: string
          processed_by?: string | null
          reason?: string | null
          request_type?: Database["public"]["Enums"]["data_request_type"]
          status?: Database["public"]["Enums"]["data_request_status"] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_requests_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "data_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      discovery_call_settings: {
        Row: {
          buffer_minutes: number | null
          calendar_provider: string | null
          calendar_sync_enabled: boolean | null
          calendar_sync_token: string | null
          call_duration_minutes: number | null
          confirmation_message: string | null
          created_at: string | null
          id: string
          is_enabled: boolean | null
          max_advance_days: number | null
          min_notice_hours: number | null
          pre_call_questions: Json | null
          provider_id: string
          reminder_hours_before: number | null
          updated_at: string | null
        }
        Insert: {
          buffer_minutes?: number | null
          calendar_provider?: string | null
          calendar_sync_enabled?: boolean | null
          calendar_sync_token?: string | null
          call_duration_minutes?: number | null
          confirmation_message?: string | null
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          max_advance_days?: number | null
          min_notice_hours?: number | null
          pre_call_questions?: Json | null
          provider_id: string
          reminder_hours_before?: number | null
          updated_at?: string | null
        }
        Update: {
          buffer_minutes?: number | null
          calendar_provider?: string | null
          calendar_sync_enabled?: boolean | null
          calendar_sync_token?: string | null
          call_duration_minutes?: number | null
          confirmation_message?: string | null
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          max_advance_days?: number | null
          min_notice_hours?: number | null
          pre_call_questions?: Json | null
          provider_id?: string
          reminder_hours_before?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "discovery_call_settings_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: true
            referencedRelation: "provider_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discovery_call_settings_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: true
            referencedRelation: "provider_stats"
            referencedColumns: ["provider_id"]
          },
          {
            foreignKeyName: "discovery_call_settings_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: true
            referencedRelation: "supplier_search_ranking"
            referencedColumns: ["provider_id"]
          },
        ]
      }
      discovery_call_slots: {
        Row: {
          created_at: string | null
          day_of_week: number
          end_time: string
          id: string
          is_active: boolean | null
          provider_id: string
          start_time: string
        }
        Insert: {
          created_at?: string | null
          day_of_week: number
          end_time: string
          id?: string
          is_active?: boolean | null
          provider_id: string
          start_time: string
        }
        Update: {
          created_at?: string | null
          day_of_week?: number
          end_time?: string
          id?: string
          is_active?: boolean | null
          provider_id?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "discovery_call_slots_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "provider_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discovery_call_slots_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "provider_stats"
            referencedColumns: ["provider_id"]
          },
          {
            foreignKeyName: "discovery_call_slots_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "supplier_search_ranking"
            referencedColumns: ["provider_id"]
          },
        ]
      }
      discovery_calls: {
        Row: {
          buyer_feedback: string | null
          buyer_id: string
          cancellation_reason: string | null
          cancelled_by: string | null
          converted_to_order_id: string | null
          created_at: string | null
          duration_minutes: number | null
          id: string
          meeting_url: string | null
          notes: string | null
          pre_call_answers: Json | null
          provider_feedback: string | null
          provider_id: string
          reminder_sent_at: string | null
          scheduled_at: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          buyer_feedback?: string | null
          buyer_id: string
          cancellation_reason?: string | null
          cancelled_by?: string | null
          converted_to_order_id?: string | null
          created_at?: string | null
          duration_minutes?: number | null
          id?: string
          meeting_url?: string | null
          notes?: string | null
          pre_call_answers?: Json | null
          provider_feedback?: string | null
          provider_id: string
          reminder_sent_at?: string | null
          scheduled_at: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          buyer_feedback?: string | null
          buyer_id?: string
          cancellation_reason?: string | null
          cancelled_by?: string | null
          converted_to_order_id?: string | null
          created_at?: string | null
          duration_minutes?: number | null
          id?: string
          meeting_url?: string | null
          notes?: string | null
          pre_call_answers?: Json | null
          provider_feedback?: string | null
          provider_id?: string
          reminder_sent_at?: string | null
          scheduled_at?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "discovery_calls_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "discovery_calls_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discovery_calls_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "discovery_calls_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discovery_calls_converted_to_order_id_fkey"
            columns: ["converted_to_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discovery_calls_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "provider_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discovery_calls_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "provider_stats"
            referencedColumns: ["provider_id"]
          },
          {
            foreignKeyName: "discovery_calls_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "supplier_search_ranking"
            referencedColumns: ["provider_id"]
          },
        ]
      }
      disputes: {
        Row: {
          assigned_to: string | null
          created_at: string | null
          evidence_urls: string[] | null
          id: string
          order_id: string
          raised_by: string
          reason: string
          resolution: string | null
          resolution_amount: number | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["dispute_status"] | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string | null
          evidence_urls?: string[] | null
          id?: string
          order_id: string
          raised_by: string
          reason: string
          resolution?: string | null
          resolution_amount?: number | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["dispute_status"] | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string | null
          evidence_urls?: string[] | null
          id?: string
          order_id?: string
          raised_by?: string
          reason?: string
          resolution?: string | null
          resolution_amount?: number | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["dispute_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "disputes_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "disputes_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_raised_by_fkey"
            columns: ["raised_by"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "disputes_raised_by_fkey"
            columns: ["raised_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      domain_familiarity: {
        Row: {
          domain_id: string
          familiarity: string
          foundry_id: string
          id: string
          notes: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          domain_id: string
          familiarity?: string
          foundry_id: string
          id?: string
          notes?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          domain_id?: string
          familiarity?: string
          foundry_id?: string
          id?: string
          notes?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "domain_familiarity_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "knowledge_domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "domain_familiarity_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "domain_familiarity_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "domain_familiarity_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      domain_question_assignments: {
        Row: {
          answer: string | null
          assigned_by: string | null
          assigned_to: string | null
          created_at: string | null
          domain_id: string
          foundry_id: string
          id: string
          notes: string | null
          question_id: string
          status: string
          updated_at: string | null
        }
        Insert: {
          answer?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          created_at?: string | null
          domain_id: string
          foundry_id: string
          id?: string
          notes?: string | null
          question_id: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          answer?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          created_at?: string | null
          domain_id?: string
          foundry_id?: string
          id?: string
          notes?: string | null
          question_id?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "domain_question_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "domain_question_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "domain_question_assignments_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "domain_question_assignments_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "domain_question_assignments_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "knowledge_domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "domain_question_assignments_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
        ]
      }
      early_access_feedback: {
        Row: {
          category: Database["public"]["Enums"]["feedback_category"]
          created_at: string
          feature_name: string | null
          foundry_id: string
          id: string
          message: string
          page_route: string | null
          user_id: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["feedback_category"]
          created_at?: string
          feature_name?: string | null
          foundry_id: string
          id?: string
          message: string
          page_route?: string | null
          user_id: string
        }
        Update: {
          category?: Database["public"]["Enums"]["feedback_category"]
          created_at?: string
          feature_name?: string | null
          foundry_id?: string
          id?: string
          message?: string
          page_route?: string | null
          user_id?: string
        }
        Relationships: []
      }
      entity_reviews: {
        Row: {
          body: string
          cons: string[] | null
          created_at: string
          entity_name: string
          entity_type: string
          helpful_count: number | null
          id: string
          pros: string[] | null
          rating: number
          reviewer_company: string | null
          reviewer_name: string | null
          reviewer_role: string | null
          title: string | null
          verified_purchase: boolean | null
        }
        Insert: {
          body: string
          cons?: string[] | null
          created_at?: string
          entity_name: string
          entity_type: string
          helpful_count?: number | null
          id?: string
          pros?: string[] | null
          rating: number
          reviewer_company?: string | null
          reviewer_name?: string | null
          reviewer_role?: string | null
          title?: string | null
          verified_purchase?: boolean | null
        }
        Update: {
          body?: string
          cons?: string[] | null
          created_at?: string
          entity_name?: string
          entity_type?: string
          helpful_count?: number | null
          id?: string
          pros?: string[] | null
          rating?: number
          reviewer_company?: string | null
          reviewer_name?: string | null
          reviewer_role?: string | null
          title?: string | null
          verified_purchase?: boolean | null
        }
        Relationships: []
      }
      escrow_transactions: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          milestone_id: string | null
          order_id: string
          stripe_transfer_id: string | null
          type: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          id?: string
          milestone_id?: string | null
          order_id: string
          stripe_transfer_id?: string | null
          type: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          milestone_id?: string | null
          order_id?: string
          stripe_transfer_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "escrow_transactions_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "order_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escrow_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      event_attendees: {
        Row: {
          checked_in_at: string | null
          event_id: string
          id: string
          rsvp_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          checked_in_at?: string | null
          event_id: string
          id?: string
          rsvp_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          checked_in_at?: string | null
          event_id?: string
          id?: string
          rsvp_at?: string
          status?: string
          updated_at?: string
          user_id?: string
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
            foreignKeyName: "event_attendees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "event_attendees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      failed_payments: {
        Row: {
          amount: number
          created_at: string | null
          currency: string | null
          failure_code: string | null
          failure_message: string | null
          id: string
          last_retry_at: string | null
          max_retries: number | null
          next_retry_at: string | null
          order_id: string | null
          resolved_at: string | null
          retry_count: number | null
          status: string | null
          stripe_payment_intent_id: string | null
          timesheet_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          currency?: string | null
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          last_retry_at?: string | null
          max_retries?: number | null
          next_retry_at?: string | null
          order_id?: string | null
          resolved_at?: string | null
          retry_count?: number | null
          status?: string | null
          stripe_payment_intent_id?: string | null
          timesheet_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          currency?: string | null
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          last_retry_at?: string | null
          max_retries?: number | null
          next_retry_at?: string | null
          order_id?: string | null
          resolved_at?: string | null
          retry_count?: number | null
          status?: string | null
          stripe_payment_intent_id?: string | null
          timesheet_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "failed_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "failed_payments_timesheet_id_fkey"
            columns: ["timesheet_id"]
            isOneToOne: false
            referencedRelation: "timesheet_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "failed_payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "failed_payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      forge_contracts: {
        Row: {
          created_at: string
          created_by: string
          document_type: string
          foundry_id: string
          id: string
          module_id: string | null
          rendered_content: string
          status: string
          supplier_name: string | null
          template_id: string | null
          updated_at: string
          variable_values: Json
          xray_scan_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          document_type: string
          foundry_id: string
          id?: string
          module_id?: string | null
          rendered_content?: string
          status?: string
          supplier_name?: string | null
          template_id?: string | null
          updated_at?: string
          variable_values?: Json
          xray_scan_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          document_type?: string
          foundry_id?: string
          id?: string
          module_id?: string | null
          rendered_content?: string
          status?: string
          supplier_name?: string | null
          template_id?: string | null
          updated_at?: string
          variable_values?: Json
          xray_scan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forge_contracts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "contract_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forge_contracts_xray_scan_id_fkey"
            columns: ["xray_scan_id"]
            isOneToOne: false
            referencedRelation: "xray_scans"
            referencedColumns: ["id"]
          },
        ]
      }
      forge_map_capabilities: {
        Row: {
          confidence: number | null
          created_at: string
          factory_id: string
          id: string
          lead_time_days: number | null
          materials: string[] | null
          max_size_x_mm: number | null
          max_size_y_mm: number | null
          max_size_z_mm: number | null
          min_order_qty: number | null
          price_tier: string | null
          process_category: string
          process_type: string
          source: string | null
          surface_finish_ra_um: number | null
          tolerance_mm: number | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          factory_id: string
          id?: string
          lead_time_days?: number | null
          materials?: string[] | null
          max_size_x_mm?: number | null
          max_size_y_mm?: number | null
          max_size_z_mm?: number | null
          min_order_qty?: number | null
          price_tier?: string | null
          process_category: string
          process_type: string
          source?: string | null
          surface_finish_ra_um?: number | null
          tolerance_mm?: number | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          factory_id?: string
          id?: string
          lead_time_days?: number | null
          materials?: string[] | null
          max_size_x_mm?: number | null
          max_size_y_mm?: number | null
          max_size_z_mm?: number | null
          min_order_qty?: number | null
          price_tier?: string | null
          process_category?: string
          process_type?: string
          source?: string | null
          surface_finish_ra_um?: number | null
          tolerance_mm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "forge_map_capabilities_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "forge_map_factories"
            referencedColumns: ["id"]
          },
        ]
      }
      forge_map_factories: {
        Row: {
          certifications: string[] | null
          company_number: string | null
          company_status: string | null
          company_type: string | null
          country: string | null
          created_at: string
          data_source: string | null
          date_of_creation: string | null
          email: string | null
          employee_count_estimate: string | null
          enrichment_date: string | null
          enrichment_status: string | null
          equipment_mentioned: string[] | null
          extraction_confidence: number | null
          id: string
          industries_served: string[] | null
          llm_extraction: Json | null
          location: unknown
          name: string
          phone: string | null
          postcode: string | null
          raw_website_text: string | null
          registered_address: Json | null
          sic_codes: string[] | null
          sic_descriptions: string[] | null
          slug: string | null
          summary: string | null
          trust_score: number | null
          updated_at: string
          website: string | null
        }
        Insert: {
          certifications?: string[] | null
          company_number?: string | null
          company_status?: string | null
          company_type?: string | null
          country?: string | null
          created_at?: string
          data_source?: string | null
          date_of_creation?: string | null
          email?: string | null
          employee_count_estimate?: string | null
          enrichment_date?: string | null
          enrichment_status?: string | null
          equipment_mentioned?: string[] | null
          extraction_confidence?: number | null
          id?: string
          industries_served?: string[] | null
          llm_extraction?: Json | null
          location?: unknown
          name: string
          phone?: string | null
          postcode?: string | null
          raw_website_text?: string | null
          registered_address?: Json | null
          sic_codes?: string[] | null
          sic_descriptions?: string[] | null
          slug?: string | null
          summary?: string | null
          trust_score?: number | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          certifications?: string[] | null
          company_number?: string | null
          company_status?: string | null
          company_type?: string | null
          country?: string | null
          created_at?: string
          data_source?: string | null
          date_of_creation?: string | null
          email?: string | null
          employee_count_estimate?: string | null
          enrichment_date?: string | null
          enrichment_status?: string | null
          equipment_mentioned?: string[] | null
          extraction_confidence?: number | null
          id?: string
          industries_served?: string[] | null
          llm_extraction?: Json | null
          location?: unknown
          name?: string
          phone?: string | null
          postcode?: string | null
          raw_website_text?: string | null
          registered_address?: Json | null
          sic_codes?: string[] | null
          sic_descriptions?: string[] | null
          slug?: string | null
          summary?: string | null
          trust_score?: number | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      forge_map_reviews: {
        Row: {
          actual_date: string | null
          communication_score: number | null
          created_at: string
          dimensional_accuracy: number | null
          factory_id: string
          foundry_id: string
          id: string
          notes: string | null
          on_time: boolean | null
          order_date: string | null
          price_vs_quote_pct: number | null
          promised_date: string | null
          quality_score: number | null
          reviewed_by: string | null
          rfq_id: string | null
          surface_quality: number | null
        }
        Insert: {
          actual_date?: string | null
          communication_score?: number | null
          created_at?: string
          dimensional_accuracy?: number | null
          factory_id: string
          foundry_id: string
          id?: string
          notes?: string | null
          on_time?: boolean | null
          order_date?: string | null
          price_vs_quote_pct?: number | null
          promised_date?: string | null
          quality_score?: number | null
          reviewed_by?: string | null
          rfq_id?: string | null
          surface_quality?: number | null
        }
        Update: {
          actual_date?: string | null
          communication_score?: number | null
          created_at?: string
          dimensional_accuracy?: number | null
          factory_id?: string
          foundry_id?: string
          id?: string
          notes?: string | null
          on_time?: boolean | null
          order_date?: string | null
          price_vs_quote_pct?: number | null
          promised_date?: string | null
          quality_score?: number | null
          reviewed_by?: string | null
          rfq_id?: string | null
          surface_quality?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "forge_map_reviews_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "forge_map_factories"
            referencedColumns: ["id"]
          },
        ]
      }
      founder_preferences: {
        Row: {
          celebration_style: string | null
          created_at: string
          decision_speed: string | null
          format_preference: string | null
          foundry_id: string
          id: string
          pet_peeves: Json | null
          preferred_length: string | null
          prefers_data: boolean | null
          prefers_recommendation: boolean | null
          tone_preference: string | null
          total_corrections: number | null
          total_interactions: number | null
          updated_at: string
          values_signals: Json | null
          vocabulary: Json | null
        }
        Insert: {
          celebration_style?: string | null
          created_at?: string
          decision_speed?: string | null
          format_preference?: string | null
          foundry_id: string
          id?: string
          pet_peeves?: Json | null
          preferred_length?: string | null
          prefers_data?: boolean | null
          prefers_recommendation?: boolean | null
          tone_preference?: string | null
          total_corrections?: number | null
          total_interactions?: number | null
          updated_at?: string
          values_signals?: Json | null
          vocabulary?: Json | null
        }
        Update: {
          celebration_style?: string | null
          created_at?: string
          decision_speed?: string | null
          format_preference?: string | null
          foundry_id?: string
          id?: string
          pet_peeves?: Json | null
          preferred_length?: string | null
          prefers_data?: boolean | null
          prefers_recommendation?: boolean | null
          tone_preference?: string | null
          total_corrections?: number | null
          total_interactions?: number | null
          updated_at?: string
          values_signals?: Json | null
          vocabulary?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "founder_preferences_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: true
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
        ]
      }
      foundries: {
        Row: {
          company_intel: Json | null
          company_profile: Json | null
          created_at: string | null
          id: string
          industry: string | null
          logo_url: string | null
          name: string
          owner_id: string | null
          purpose_data: Json | null
          report_accent_color: string | null
          report_primary_color: string | null
          sector: string | null
          slug: string | null
          stage: string | null
        }
        Insert: {
          company_intel?: Json | null
          company_profile?: Json | null
          created_at?: string | null
          id: string
          industry?: string | null
          logo_url?: string | null
          name: string
          owner_id?: string | null
          purpose_data?: Json | null
          report_accent_color?: string | null
          report_primary_color?: string | null
          sector?: string | null
          slug?: string | null
          stage?: string | null
        }
        Update: {
          company_intel?: Json | null
          company_profile?: Json | null
          created_at?: string | null
          id?: string
          industry?: string | null
          logo_url?: string | null
          name?: string
          owner_id?: string | null
          purpose_data?: Json | null
          report_accent_color?: string | null
          report_primary_color?: string | null
          sector?: string | null
          slug?: string | null
          stage?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "foundries_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "foundries_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      foundry_admin_audit_log: {
        Row: {
          action: string
          actor_id: string
          created_at: string | null
          details: Json | null
          foundry_id: string
          id: string
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string | null
          details?: Json | null
          foundry_id: string
          id?: string
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string | null
          details?: Json | null
          foundry_id?: string
          id?: string
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "foundry_admin_audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "foundry_admin_audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "foundry_admin_audit_log_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "foundry_admin_audit_log_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      foundry_admin_permissions: {
        Row: {
          created_at: string | null
          foundry_id: string
          granted_by: string
          id: string
          profile_id: string
        }
        Insert: {
          created_at?: string | null
          foundry_id: string
          granted_by: string
          id?: string
          profile_id: string
        }
        Update: {
          created_at?: string | null
          foundry_id?: string
          granted_by?: string
          id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "foundry_admin_permissions_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "foundry_admin_permissions_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "foundry_admin_permissions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "foundry_admin_permissions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      foundry_agent_permissions: {
        Row: {
          created_at: string
          custom_limits: Json | null
          enabled: boolean | null
          foundry_id: string
          id: string
          tier_name: string
        }
        Insert: {
          created_at?: string
          custom_limits?: Json | null
          enabled?: boolean | null
          foundry_id: string
          id?: string
          tier_name: string
        }
        Update: {
          created_at?: string
          custom_limits?: Json | null
          enabled?: boolean | null
          foundry_id?: string
          id?: string
          tier_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "foundry_agent_permissions_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
        ]
      }
      foundry_agent_preferences: {
        Row: {
          created_at: string
          foundry_id: string
          id: string
          monthly_budget_usd: number
          notify_critical_in_app: boolean
          notify_critical_telegram: boolean
          notify_digest_telegram: boolean
          notify_important_in_app: boolean
          notify_important_telegram: boolean
          specialist_overrides: Json | null
          sweep_interval_minutes: number
          sweeps_enabled: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          foundry_id: string
          id?: string
          monthly_budget_usd?: number
          notify_critical_in_app?: boolean
          notify_critical_telegram?: boolean
          notify_digest_telegram?: boolean
          notify_important_in_app?: boolean
          notify_important_telegram?: boolean
          specialist_overrides?: Json | null
          sweep_interval_minutes?: number
          sweeps_enabled?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          foundry_id?: string
          id?: string
          monthly_budget_usd?: number
          notify_critical_in_app?: boolean
          notify_critical_telegram?: boolean
          notify_digest_telegram?: boolean
          notify_important_in_app?: boolean
          notify_important_telegram?: boolean
          specialist_overrides?: Json | null
          sweep_interval_minutes?: number
          sweeps_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "foundry_agent_preferences_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: true
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
        ]
      }
      foundry_business_functions: {
        Row: {
          created_at: string | null
          display_order: number
          foundry_id: string
          function_id: string
          id: string
          label: string
          short: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_order?: number
          foundry_id: string
          function_id: string
          id?: string
          label: string
          short: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_order?: number
          foundry_id?: string
          function_id?: string
          id?: string
          label?: string
          short?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      foundry_function_coverage: {
        Row: {
          assessed_at: string | null
          assessed_by: string | null
          coverage_status: string
          covered_by: string | null
          created_at: string | null
          foundry_id: string
          function_id: string
          id: string
          notes: string | null
          updated_at: string | null
        }
        Insert: {
          assessed_at?: string | null
          assessed_by?: string | null
          coverage_status?: string
          covered_by?: string | null
          created_at?: string | null
          foundry_id: string
          function_id: string
          id?: string
          notes?: string | null
          updated_at?: string | null
        }
        Update: {
          assessed_at?: string | null
          assessed_by?: string | null
          coverage_status?: string
          covered_by?: string | null
          created_at?: string | null
          foundry_id?: string
          function_id?: string
          id?: string
          notes?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "foundry_function_coverage_assessed_by_fkey"
            columns: ["assessed_by"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "foundry_function_coverage_assessed_by_fkey"
            columns: ["assessed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "foundry_function_coverage_function_id_fkey"
            columns: ["function_id"]
            isOneToOne: false
            referencedRelation: "business_functions"
            referencedColumns: ["id"]
          },
        ]
      }
      foundry_integrations: {
        Row: {
          config: Json
          created_at: string | null
          foundry_id: string
          id: string
          is_active: boolean
          service_type: string
          updated_at: string | null
        }
        Insert: {
          config?: Json
          created_at?: string | null
          foundry_id: string
          id?: string
          is_active?: boolean
          service_type: string
          updated_at?: string | null
        }
        Update: {
          config?: Json
          created_at?: string | null
          foundry_id?: string
          id?: string
          is_active?: boolean
          service_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      foundry_memberships: {
        Row: {
          foundry_id: string
          id: string
          invited_by: string | null
          is_primary: boolean | null
          joined_at: string | null
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Insert: {
          foundry_id: string
          id?: string
          invited_by?: string | null
          is_primary?: boolean | null
          joined_at?: string | null
          role?: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Update: {
          foundry_id?: string
          id?: string
          invited_by?: string | null
          is_primary?: boolean | null
          joined_at?: string | null
          role?: Database["public"]["Enums"]["member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "foundry_memberships_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "foundry_memberships_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "foundry_memberships_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "foundry_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "foundry_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      foundry_offboarding_settings: {
        Row: {
          created_at: string | null
          default_action: Database["public"]["Enums"]["offboarding_action"]
          foundry_id: string
          id: string
          require_task_reassignment: boolean
          retention_days: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          default_action?: Database["public"]["Enums"]["offboarding_action"]
          foundry_id: string
          id?: string
          require_task_reassignment?: boolean
          retention_days?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          default_action?: Database["public"]["Enums"]["offboarding_action"]
          foundry_id?: string
          id?: string
          require_task_reassignment?: boolean
          retention_days?: number | null
          updated_at?: string | null
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
      fraud_signals: {
        Row: {
          action_taken: string | null
          created_at: string | null
          details: Json | null
          id: string
          reviewed_by: string | null
          severity: string
          signal_type: string
          user_id: string
        }
        Insert: {
          action_taken?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string
          reviewed_by?: string | null
          severity: string
          signal_type: string
          user_id: string
        }
        Update: {
          action_taken?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string
          reviewed_by?: string | null
          severity?: string
          signal_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fraud_signals_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fraud_signals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "fraud_signals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      funding_requirements: {
        Row: {
          amount_usd: number | null
          analysis_id: string | null
          created_at: string
          foundry_id: string
          funding_type: string | null
          id: string
          linked_objective_ids: string[] | null
          needed_by_date: string | null
          reason: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          amount_usd?: number | null
          analysis_id?: string | null
          created_at?: string
          foundry_id: string
          funding_type?: string | null
          id?: string
          linked_objective_ids?: string[] | null
          needed_by_date?: string | null
          reason?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          amount_usd?: number | null
          analysis_id?: string | null
          created_at?: string
          foundry_id?: string
          funding_type?: string | null
          id?: string
          linked_objective_ids?: string[] | null
          needed_by_date?: string | null
          reason?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "funding_requirements_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "business_plan_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_requirements_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
        ]
      }
      google_oauth_tokens: {
        Row: {
          access_token: string
          created_at: string
          foundry_id: string
          google_email: string
          id: string
          refresh_token: string | null
          scopes: string[]
          token_expires_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          foundry_id: string
          google_email: string
          id?: string
          refresh_token?: string | null
          scopes?: string[]
          token_expires_at: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          foundry_id?: string
          google_email?: string
          id?: string
          refresh_token?: string | null
          scopes?: string[]
          token_expires_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_oauth_tokens_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
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
          event_format: string
          event_type: string
          event_url: string | null
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
          event_format?: string
          event_type?: string
          event_url?: string | null
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
          event_format?: string
          event_type?: string
          event_url?: string | null
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
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
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
      hiring_requirements: {
        Row: {
          ai_suggested_date: string | null
          analysis_id: string | null
          created_at: string
          foundry_id: string
          id: string
          linked_objective_id: string | null
          reason: string | null
          role_title: string
          role_type: string
          status: string
          updated_at: string
          user_override_date: string | null
        }
        Insert: {
          ai_suggested_date?: string | null
          analysis_id?: string | null
          created_at?: string
          foundry_id: string
          id?: string
          linked_objective_id?: string | null
          reason?: string | null
          role_title: string
          role_type: string
          status?: string
          updated_at?: string
          user_override_date?: string | null
        }
        Update: {
          ai_suggested_date?: string | null
          analysis_id?: string | null
          created_at?: string
          foundry_id?: string
          id?: string
          linked_objective_id?: string | null
          reason?: string | null
          role_title?: string
          role_type?: string
          status?: string
          updated_at?: string
          user_override_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hiring_requirements_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "business_plan_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hiring_requirements_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hiring_requirements_linked_objective_id_fkey"
            columns: ["linked_objective_id"]
            isOneToOne: false
            referencedRelation: "objectives"
            referencedColumns: ["id"]
          },
        ]
      }
      insight_log: {
        Row: {
          acted_on_at: string | null
          content_hash: string
          content_summary: string
          dismissed: boolean | null
          foundry_id: string
          id: string
          insight_type: string
          surfaced_at: string
          user_id: string
          was_acted_on: boolean | null
        }
        Insert: {
          acted_on_at?: string | null
          content_hash: string
          content_summary: string
          dismissed?: boolean | null
          foundry_id: string
          id?: string
          insight_type: string
          surfaced_at?: string
          user_id: string
          was_acted_on?: boolean | null
        }
        Update: {
          acted_on_at?: string | null
          content_hash?: string
          content_summary?: string
          dismissed?: boolean | null
          foundry_id?: string
          id?: string
          insight_type?: string
          surfaced_at?: string
          user_id?: string
          was_acted_on?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "insight_log_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_reports: {
        Row: {
          created_at: string
          foundry_id: string
          id: string
          implications: Json | null
          is_read: boolean | null
          recommended_actions: Json | null
          source_id: string
          specialist_id: string
          summary: string
          title: string
          urgency: string
        }
        Insert: {
          created_at?: string
          foundry_id: string
          id?: string
          implications?: Json | null
          is_read?: boolean | null
          recommended_actions?: Json | null
          source_id: string
          specialist_id: string
          summary: string
          title: string
          urgency?: string
        }
        Update: {
          created_at?: string
          foundry_id?: string
          id?: string
          implications?: Json | null
          is_read?: boolean | null
          recommended_actions?: Json | null
          source_id?: string
          specialist_id?: string
          summary?: string
          title?: string
          urgency?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_reports_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_sweep_log: {
        Row: {
          foundry_id: string
          id: string
          last_run_at: string
          source_id: string
        }
        Insert: {
          foundry_id: string
          id?: string
          last_run_at?: string
          source_id: string
        }
        Update: {
          foundry_id?: string
          id?: string
          last_run_at?: string
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_sweep_log_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_domains: {
        Row: {
          ai_summary: string | null
          category: string | null
          created_at: string | null
          criticality: string | null
          depth: number | null
          description: string | null
          display_order: number | null
          foundry_id: string | null
          icon: string
          id: string
          key_questions: Json | null
          learning_resources: Json | null
          learning_time_estimate: string | null
          marketplace_categories: string[] | null
          name: string
          note_count: number
          parent_id: string | null
          prerequisite_domain_ids: string[] | null
          primer: Json | null
          related_domain_ids: string[] | null
          slug: string | null
          sort_order: number
          supplier_categories: string[] | null
          template_id: string | null
          typical_roles: string[] | null
          updated_at: string | null
        }
        Insert: {
          ai_summary?: string | null
          category?: string | null
          created_at?: string | null
          criticality?: string | null
          depth?: number | null
          description?: string | null
          display_order?: number | null
          foundry_id?: string | null
          icon?: string
          id?: string
          key_questions?: Json | null
          learning_resources?: Json | null
          learning_time_estimate?: string | null
          marketplace_categories?: string[] | null
          name: string
          note_count?: number
          parent_id?: string | null
          prerequisite_domain_ids?: string[] | null
          primer?: Json | null
          related_domain_ids?: string[] | null
          slug?: string | null
          sort_order?: number
          supplier_categories?: string[] | null
          template_id?: string | null
          typical_roles?: string[] | null
          updated_at?: string | null
        }
        Update: {
          ai_summary?: string | null
          category?: string | null
          created_at?: string | null
          criticality?: string | null
          depth?: number | null
          description?: string | null
          display_order?: number | null
          foundry_id?: string | null
          icon?: string
          id?: string
          key_questions?: Json | null
          learning_resources?: Json | null
          learning_time_estimate?: string | null
          marketplace_categories?: string[] | null
          name?: string
          note_count?: number
          parent_id?: string | null
          prerequisite_domain_ids?: string[] | null
          primer?: Json | null
          related_domain_ids?: string[] | null
          slug?: string | null
          sort_order?: number
          supplier_categories?: string[] | null
          template_id?: string | null
          typical_roles?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_domains_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_domains_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "knowledge_domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_domains_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "blueprint_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_links: {
        Row: {
          created_at: string
          description: string
          discovered_by: string
          foundry_id: string
          id: string
          relationship: string
          source_note_id: string
          target_note_id: string
        }
        Insert: {
          created_at?: string
          description?: string
          discovered_by?: string
          foundry_id: string
          id?: string
          relationship?: string
          source_note_id: string
          target_note_id: string
        }
        Update: {
          created_at?: string
          description?: string
          discovered_by?: string
          foundry_id?: string
          id?: string
          relationship?: string
          source_note_id?: string
          target_note_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_links_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_links_source_note_id_fkey"
            columns: ["source_note_id"]
            isOneToOne: false
            referencedRelation: "knowledge_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_links_target_note_id_fkey"
            columns: ["target_note_id"]
            isOneToOne: false
            referencedRelation: "knowledge_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_notes: {
        Row: {
          confidence: number
          content: string
          created_at: string
          description: string
          domain_id: string | null
          extraction_metadata: Json
          foundry_id: string
          id: string
          is_archived: boolean
          is_pinned: boolean
          is_verified: boolean
          link_count: number
          note_type: string
          source_message_id: string | null
          source_specialist: string | null
          source_thread_id: string | null
          tags: string[]
          title: string
          updated_at: string
          verified_at: string | null
          verified_by: string | null
          view_count: number
        }
        Insert: {
          confidence?: number
          content: string
          created_at?: string
          description?: string
          domain_id?: string | null
          extraction_metadata?: Json
          foundry_id: string
          id?: string
          is_archived?: boolean
          is_pinned?: boolean
          is_verified?: boolean
          link_count?: number
          note_type?: string
          source_message_id?: string | null
          source_specialist?: string | null
          source_thread_id?: string | null
          tags?: string[]
          title: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
          view_count?: number
        }
        Update: {
          confidence?: number
          content?: string
          created_at?: string
          description?: string
          domain_id?: string | null
          extraction_metadata?: Json
          foundry_id?: string
          id?: string
          is_archived?: boolean
          is_pinned?: boolean
          is_verified?: boolean
          link_count?: number
          note_type?: string
          source_message_id?: string | null
          source_specialist?: string | null
          source_thread_id?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_notes_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "knowledge_domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_notes_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_notes_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "knowledge_notes_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_modules: {
        Row: {
          content_data: Json | null
          content_type: string | null
          content_url: string | null
          counts_as_otjt: boolean | null
          created_at: string | null
          description: string | null
          estimated_hours: number
          has_assessment: boolean | null
          id: string
          is_active: boolean | null
          is_mandatory: boolean | null
          max_attempts: number | null
          module_type: string
          order_index: number | null
          passing_score: number | null
          prerequisite_module_id: string | null
          programme_id: string | null
          skills_taught: Json | null
          title: string
          unlock_after_days: number | null
          updated_at: string | null
        }
        Insert: {
          content_data?: Json | null
          content_type?: string | null
          content_url?: string | null
          counts_as_otjt?: boolean | null
          created_at?: string | null
          description?: string | null
          estimated_hours?: number
          has_assessment?: boolean | null
          id?: string
          is_active?: boolean | null
          is_mandatory?: boolean | null
          max_attempts?: number | null
          module_type: string
          order_index?: number | null
          passing_score?: number | null
          prerequisite_module_id?: string | null
          programme_id?: string | null
          skills_taught?: Json | null
          title: string
          unlock_after_days?: number | null
          updated_at?: string | null
        }
        Update: {
          content_data?: Json | null
          content_type?: string | null
          content_url?: string | null
          counts_as_otjt?: boolean | null
          created_at?: string | null
          description?: string | null
          estimated_hours?: number
          has_assessment?: boolean | null
          id?: string
          is_active?: boolean | null
          is_mandatory?: boolean | null
          max_attempts?: number | null
          module_type?: string
          order_index?: number | null
          passing_score?: number | null
          prerequisite_module_id?: string | null
          programme_id?: string | null
          skills_taught?: Json | null
          title?: string
          unlock_after_days?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "learning_modules_prerequisite_module_id_fkey"
            columns: ["prerequisite_module_id"]
            isOneToOne: false
            referencedRelation: "learning_modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_modules_programme_id_fkey"
            columns: ["programme_id"]
            isOneToOne: false
            referencedRelation: "apprenticeship_programmes"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_migration: {
        Row: {
          contact_email: string | null
          id: string
          invitation_sent_at: string | null
          listing_id: string
          migration_completed_at: string | null
          provider_created_at: string | null
          status: string | null
        }
        Insert: {
          contact_email?: string | null
          id?: string
          invitation_sent_at?: string | null
          listing_id: string
          migration_completed_at?: string | null
          provider_created_at?: string | null
          status?: string | null
        }
        Update: {
          contact_email?: string | null
          id?: string
          invitation_sent_at?: string | null
          listing_id?: string
          migration_completed_at?: string | null
          provider_created_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listing_migration_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_migration_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "supplier_search_ranking"
            referencedColumns: ["listing_id"]
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
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
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
          approval_notes: string | null
          approval_status: string | null
          approved_at: string | null
          approved_by: string | null
          attributes: Json | null
          category: Database["public"]["Enums"]["marketplace_category"]
          created_at: string | null
          created_by_provider_id: string | null
          description: string | null
          embedding: string | null
          id: string
          image_url: string | null
          is_demo: boolean
          is_self_created: boolean | null
          is_verified: boolean | null
          search_vector: unknown
          subcategory: string
          title: string
        }
        Insert: {
          approval_notes?: string | null
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          attributes?: Json | null
          category: Database["public"]["Enums"]["marketplace_category"]
          created_at?: string | null
          created_by_provider_id?: string | null
          description?: string | null
          embedding?: string | null
          id?: string
          image_url?: string | null
          is_demo?: boolean
          is_self_created?: boolean | null
          is_verified?: boolean | null
          search_vector?: unknown
          subcategory: string
          title: string
        }
        Update: {
          approval_notes?: string | null
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          attributes?: Json | null
          category?: Database["public"]["Enums"]["marketplace_category"]
          created_at?: string | null
          created_by_provider_id?: string | null
          description?: string | null
          embedding?: string | null
          id?: string
          image_url?: string | null
          is_demo?: boolean
          is_self_created?: boolean | null
          is_verified?: boolean | null
          search_vector?: unknown
          subcategory?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_listings_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "marketplace_listings_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_listings_created_by_provider_id_fkey"
            columns: ["created_by_provider_id"]
            isOneToOne: false
            referencedRelation: "provider_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_listings_created_by_provider_id_fkey"
            columns: ["created_by_provider_id"]
            isOneToOne: false
            referencedRelation: "provider_stats"
            referencedColumns: ["provider_id"]
          },
          {
            foreignKeyName: "marketplace_listings_created_by_provider_id_fkey"
            columns: ["created_by_provider_id"]
            isOneToOne: false
            referencedRelation: "supplier_search_ranking"
            referencedColumns: ["provider_id"]
          },
        ]
      }
      marketplace_recommendations: {
        Row: {
          category: string
          created_at: string | null
          dismissed_at: string | null
          dismissed_by: string | null
          expires_at: string | null
          foundry_id: string
          id: string
          is_dismissed: boolean | null
          priority: number | null
          reasoning: string | null
          search_term: string | null
          source_id: string | null
          source_type: string
          subcategory: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          dismissed_at?: string | null
          dismissed_by?: string | null
          expires_at?: string | null
          foundry_id: string
          id?: string
          is_dismissed?: boolean | null
          priority?: number | null
          reasoning?: string | null
          search_term?: string | null
          source_id?: string | null
          source_type: string
          subcategory?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          dismissed_at?: string | null
          dismissed_by?: string | null
          expires_at?: string | null
          foundry_id?: string
          id?: string
          is_dismissed?: boolean | null
          priority?: number | null
          reasoning?: string | null
          search_term?: string | null
          source_id?: string | null
          source_type?: string
          subcategory?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_recommendations_dismissed_by_fkey"
            columns: ["dismissed_by"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "marketplace_recommendations_dismissed_by_fkey"
            columns: ["dismissed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string | null
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_stars: {
        Row: {
          created_at: string | null
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_stars_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_stars_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "message_stars_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          category: string | null
          content: string
          created_at: string | null
          id: string
          is_system: boolean | null
          name: string
          user_id: string | null
        }
        Insert: {
          category?: string | null
          content: string
          created_at?: string | null
          id?: string
          is_system?: boolean | null
          name: string
          user_id?: string | null
        }
        Update: {
          category?: string | null
          content?: string
          created_at?: string | null
          id?: string
          is_system?: boolean | null
          name?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "message_templates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string | null
          file_url: string | null
          id: string
          is_read: boolean | null
          last_reply_at: string | null
          message_type: string | null
          objective_id: string | null
          parent_message_id: string | null
          read_at: string | null
          reply_count: number | null
          sender_id: string
          task_id: string | null
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string | null
          file_url?: string | null
          id?: string
          is_read?: boolean | null
          last_reply_at?: string | null
          message_type?: string | null
          objective_id?: string | null
          parent_message_id?: string | null
          read_at?: string | null
          reply_count?: number | null
          sender_id: string
          task_id?: string | null
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string | null
          file_url?: string | null
          id?: string
          is_read?: boolean | null
          last_reply_at?: string | null
          message_type?: string | null
          objective_id?: string | null
          parent_message_id?: string | null
          read_at?: string | null
          reply_count?: number | null
          sender_id?: string
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_objective_id_fkey"
            columns: ["objective_id"]
            isOneToOne: false
            referencedRelation: "objectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_parent_message_id_fkey"
            columns: ["parent_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      messaging_links: {
        Row: {
          created_at: string | null
          foundry_id: string
          id: string
          platform: string
          platform_user_id: string
          platform_username: string | null
          profile_id: string
          updated_at: string | null
          verification_code: string | null
          verification_expires_at: string | null
          verified_at: string | null
        }
        Insert: {
          created_at?: string | null
          foundry_id: string
          id?: string
          platform: string
          platform_user_id: string
          platform_username?: string | null
          profile_id: string
          updated_at?: string | null
          verification_code?: string | null
          verification_expires_at?: string | null
          verified_at?: string | null
        }
        Update: {
          created_at?: string | null
          foundry_id?: string
          id?: string
          platform?: string
          platform_user_id?: string
          platform_username?: string | null
          profile_id?: string
          updated_at?: string | null
          verification_code?: string | null
          verification_expires_at?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messaging_links_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messaging_links_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "messaging_links_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      module_completions: {
        Row: {
          attempts: number | null
          completed_at: string | null
          created_at: string | null
          enrollment_id: string
          evidence_urls: Json | null
          feedback: string | null
          graded_at: string | null
          graded_by: string | null
          hours_logged: number | null
          id: string
          module_id: string
          reflection: string | null
          score: number | null
          started_at: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          attempts?: number | null
          completed_at?: string | null
          created_at?: string | null
          enrollment_id: string
          evidence_urls?: Json | null
          feedback?: string | null
          graded_at?: string | null
          graded_by?: string | null
          hours_logged?: number | null
          id?: string
          module_id: string
          reflection?: string | null
          score?: number | null
          started_at?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          attempts?: number | null
          completed_at?: string | null
          created_at?: string | null
          enrollment_id?: string
          evidence_urls?: Json | null
          feedback?: string | null
          graded_at?: string | null
          graded_by?: string | null
          hours_logged?: number | null
          id?: string
          module_id?: string
          reflection?: string | null
          score?: number | null
          started_at?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "module_completions_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "apprenticeship_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "module_completions_graded_by_fkey"
            columns: ["graded_by"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "module_completions_graded_by_fkey"
            columns: ["graded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "module_completions_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "learning_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      money_map_cost_items: {
        Row: {
          amount: number
          category: string
          cost_type: string
          created_at: string
          currency: string
          description: string | null
          foundry_id: string
          id: string
          is_active: boolean
          name: string
          period: string
          sort_order: number
          source: string
          updated_at: string
        }
        Insert: {
          amount?: number
          category?: string
          cost_type?: string
          created_at?: string
          currency?: string
          description?: string | null
          foundry_id: string
          id?: string
          is_active?: boolean
          name: string
          period?: string
          sort_order?: number
          source?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          cost_type?: string
          created_at?: string
          currency?: string
          description?: string | null
          foundry_id?: string
          id?: string
          is_active?: boolean
          name?: string
          period?: string
          sort_order?: number
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "money_map_cost_items_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
        ]
      }
      money_map_cost_links: {
        Row: {
          allocation_method: string
          allocation_pct: number
          cost_item_id: string
          created_at: string
          id: string
          revenue_stream_id: string
          updated_at: string
        }
        Insert: {
          allocation_method?: string
          allocation_pct?: number
          cost_item_id: string
          created_at?: string
          id?: string
          revenue_stream_id: string
          updated_at?: string
        }
        Update: {
          allocation_method?: string
          allocation_pct?: number
          cost_item_id?: string
          created_at?: string
          id?: string
          revenue_stream_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "money_map_cost_links_cost_item_id_fkey"
            columns: ["cost_item_id"]
            isOneToOne: false
            referencedRelation: "money_map_cost_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "money_map_cost_links_revenue_stream_id_fkey"
            columns: ["revenue_stream_id"]
            isOneToOne: false
            referencedRelation: "money_map_revenue_streams"
            referencedColumns: ["id"]
          },
        ]
      }
      money_map_revenue_streams: {
        Row: {
          amount: number
          auto_source_type: string | null
          category: string
          created_at: string
          currency: string
          description: string | null
          foundry_id: string
          id: string
          is_active: boolean
          name: string
          period: string
          sort_order: number
          source: string
          updated_at: string
        }
        Insert: {
          amount?: number
          auto_source_type?: string | null
          category?: string
          created_at?: string
          currency?: string
          description?: string | null
          foundry_id: string
          id?: string
          is_active?: boolean
          name: string
          period?: string
          sort_order?: number
          source?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          auto_source_type?: string | null
          category?: string
          created_at?: string
          currency?: string
          description?: string | null
          foundry_id?: string
          id?: string
          is_active?: boolean
          name?: string
          period?: string
          sort_order?: number
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "money_map_revenue_streams_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
        ]
      }
      money_map_snapshots: {
        Row: {
          created_at: string
          foundry_id: string
          id: string
          name: string
          net_margin_pct: number
          period_label: string
          snapshot_data: Json
          total_costs: number
          total_revenue: number
        }
        Insert: {
          created_at?: string
          foundry_id: string
          id?: string
          name: string
          net_margin_pct?: number
          period_label: string
          snapshot_data?: Json
          total_costs?: number
          total_revenue?: number
        }
        Update: {
          created_at?: string
          foundry_id?: string
          id?: string
          name?: string
          net_margin_pct?: number
          period_label?: string
          snapshot_data?: Json
          total_costs?: number
          total_revenue?: number
        }
        Relationships: [
          {
            foreignKeyName: "money_map_snapshots_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
        ]
      }
      mounting_standards: {
        Row: {
          created_at: string | null
          id: string
          interface_type: string
          mates_with: string[] | null
          name: string
          params: Json
          slug: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          interface_type: string
          mates_with?: string[] | null
          name: string
          params?: Json
          slug: string
        }
        Update: {
          created_at?: string | null
          id?: string
          interface_type?: string
          mates_with?: string[] | null
          name?: string
          params?: Json
          slug?: string
        }
        Relationships: []
      }
      notification_log: {
        Row: {
          action_url: string | null
          body: string | null
          channels: Database["public"]["Enums"]["notification_channel"][] | null
          created_at: string | null
          delivered_via:
            | Database["public"]["Enums"]["notification_channel"][]
            | null
          id: string
          priority: Database["public"]["Enums"]["notification_priority"]
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          action_url?: string | null
          body?: string | null
          channels?:
            | Database["public"]["Enums"]["notification_channel"][]
            | null
          created_at?: string | null
          delivered_via?:
            | Database["public"]["Enums"]["notification_channel"][]
            | null
          id?: string
          priority: Database["public"]["Enums"]["notification_priority"]
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          action_url?: string | null
          body?: string | null
          channels?:
            | Database["public"]["Enums"]["notification_channel"][]
            | null
          created_at?: string | null
          delivered_via?:
            | Database["public"]["Enums"]["notification_channel"][]
            | null
          id?: string
          priority?: Database["public"]["Enums"]["notification_priority"]
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "notification_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          channel: Database["public"]["Enums"]["notification_channel"]
          critical_enabled: boolean | null
          enabled: boolean | null
          high_enabled: boolean | null
          id: string
          low_enabled: boolean | null
          medium_enabled: boolean | null
          phone_number: string | null
          push_token: string | null
          user_id: string
        }
        Insert: {
          channel: Database["public"]["Enums"]["notification_channel"]
          critical_enabled?: boolean | null
          enabled?: boolean | null
          high_enabled?: boolean | null
          id?: string
          low_enabled?: boolean | null
          medium_enabled?: boolean | null
          phone_number?: string | null
          push_token?: string | null
          user_id: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["notification_channel"]
          critical_enabled?: boolean | null
          enabled?: boolean | null
          high_enabled?: boolean | null
          id?: string
          low_enabled?: boolean | null
          medium_enabled?: boolean | null
          phone_number?: string | null
          push_token?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
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
      objective_comment_reads: {
        Row: {
          comment_id: string
          foundry_id: string
          read_at: string | null
          user_id: string
        }
        Insert: {
          comment_id: string
          foundry_id: string
          read_at?: string | null
          user_id: string
        }
        Update: {
          comment_id?: string
          foundry_id?: string
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "objective_comment_reads_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "objective_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objective_comment_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "objective_comment_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      objective_comments: {
        Row: {
          content: string
          created_at: string | null
          foundry_id: string
          id: string
          is_system_log: boolean | null
          message_id: string | null
          objective_id: string
          synced_from_message: boolean | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          foundry_id: string
          id?: string
          is_system_log?: boolean | null
          message_id?: string | null
          objective_id: string
          synced_from_message?: boolean | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          foundry_id?: string
          id?: string
          is_system_log?: boolean | null
          message_id?: string | null
          objective_id?: string
          synced_from_message?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "objective_comments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objective_comments_objective_id_fkey"
            columns: ["objective_id"]
            isOneToOne: false
            referencedRelation: "objectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objective_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "objective_comments_user_id_fkey"
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
          product_category: string | null
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
          product_category?: string | null
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
          product_category?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      objective_shares: {
        Row: {
          created_at: string | null
          id: string
          objective_id: string
          shared_by: string
          shared_with_team_id: string | null
          shared_with_user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          objective_id: string
          shared_by: string
          shared_with_team_id?: string | null
          shared_with_user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          objective_id?: string
          shared_by?: string
          shared_with_team_id?: string | null
          shared_with_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objective_shares_objective_id_fkey"
            columns: ["objective_id"]
            isOneToOne: false
            referencedRelation: "objectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objective_shares_shared_by_fkey"
            columns: ["shared_by"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "objective_shares_shared_by_fkey"
            columns: ["shared_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objective_shares_shared_with_team_id_fkey"
            columns: ["shared_with_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objective_shares_shared_with_user_id_fkey"
            columns: ["shared_with_user_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "objective_shares_shared_with_user_id_fkey"
            columns: ["shared_with_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      objectives: {
        Row: {
          agent_approved: boolean | null
          ai_suggestions: Json | null
          blueprint_id: string | null
          created_at: string | null
          created_by_agent_id: string | null
          creator_id: string
          deleted_at: string | null
          description: string | null
          end_date: string | null
          extended_description: string | null
          foundry_id: string
          ghost_rationale: string | null
          ghost_source: string | null
          goal_type: string | null
          id: string
          is_demo: boolean
          is_ghost: boolean
          is_milestone: boolean
          is_private: boolean
          is_strategic_goal: boolean | null
          milestone_date: string | null
          milestone_order_index: number
          owner_agent_id: string | null
          parent_objective_id: string | null
          progress: number | null
          resource_suggestions: Json | null
          start_date: string | null
          status: string | null
          strategic_risks: Json | null
          title: string
          updated_at: string | null
          workstream: string | null
        }
        Insert: {
          agent_approved?: boolean | null
          ai_suggestions?: Json | null
          blueprint_id?: string | null
          created_at?: string | null
          created_by_agent_id?: string | null
          creator_id: string
          deleted_at?: string | null
          description?: string | null
          end_date?: string | null
          extended_description?: string | null
          foundry_id: string
          ghost_rationale?: string | null
          ghost_source?: string | null
          goal_type?: string | null
          id?: string
          is_demo?: boolean
          is_ghost?: boolean
          is_milestone?: boolean
          is_private?: boolean
          is_strategic_goal?: boolean | null
          milestone_date?: string | null
          milestone_order_index?: number
          owner_agent_id?: string | null
          parent_objective_id?: string | null
          progress?: number | null
          resource_suggestions?: Json | null
          start_date?: string | null
          status?: string | null
          strategic_risks?: Json | null
          title: string
          updated_at?: string | null
          workstream?: string | null
        }
        Update: {
          agent_approved?: boolean | null
          ai_suggestions?: Json | null
          blueprint_id?: string | null
          created_at?: string | null
          created_by_agent_id?: string | null
          creator_id?: string
          deleted_at?: string | null
          description?: string | null
          end_date?: string | null
          extended_description?: string | null
          foundry_id?: string
          ghost_rationale?: string | null
          ghost_source?: string | null
          goal_type?: string | null
          id?: string
          is_demo?: boolean
          is_ghost?: boolean
          is_milestone?: boolean
          is_private?: boolean
          is_strategic_goal?: boolean | null
          milestone_date?: string | null
          milestone_order_index?: number
          owner_agent_id?: string | null
          parent_objective_id?: string | null
          progress?: number | null
          resource_suggestions?: Json | null
          start_date?: string | null
          status?: string | null
          strategic_risks?: Json | null
          title?: string
          updated_at?: string | null
          workstream?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objectives_blueprint_id_fkey"
            columns: ["blueprint_id"]
            isOneToOne: false
            referencedRelation: "blueprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objectives_created_by_agent_id_fkey"
            columns: ["created_by_agent_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "objectives_created_by_agent_id_fkey"
            columns: ["created_by_agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objectives_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "objectives_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objectives_owner_agent_id_fkey"
            columns: ["owner_agent_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "objectives_owner_agent_id_fkey"
            columns: ["owner_agent_id"]
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
      offboarding_tasks: {
        Row: {
          created_at: string | null
          departing_user_id: string
          foundry_id: string
          id: string
          reassigned_to: string | null
          relationship_type: string
          status: string
          task_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          departing_user_id: string
          foundry_id: string
          id?: string
          reassigned_to?: string | null
          relationship_type: string
          status?: string
          task_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          departing_user_id?: string
          foundry_id?: string
          id?: string
          reassigned_to?: string | null
          relationship_type?: string
          status?: string
          task_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "offboarding_tasks_departing_user_id_fkey"
            columns: ["departing_user_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "offboarding_tasks_departing_user_id_fkey"
            columns: ["departing_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offboarding_tasks_reassigned_to_fkey"
            columns: ["reassigned_to"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "offboarding_tasks_reassigned_to_fkey"
            columns: ["reassigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offboarding_tasks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      order_contracts: {
        Row: {
          buyer_signed_at: string | null
          created_at: string | null
          id: string
          order_id: string
          pdf_url: string | null
          rendered_content: string
          seller_signed_at: string | null
          template_id: string | null
          variable_values: Json | null
        }
        Insert: {
          buyer_signed_at?: string | null
          created_at?: string | null
          id?: string
          order_id: string
          pdf_url?: string | null
          rendered_content: string
          seller_signed_at?: string | null
          template_id?: string | null
          variable_values?: Json | null
        }
        Update: {
          buyer_signed_at?: string | null
          created_at?: string | null
          id?: string
          order_id?: string
          pdf_url?: string | null
          rendered_content?: string
          seller_signed_at?: string | null
          template_id?: string | null
          variable_values?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "order_contracts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_contracts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "contract_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      order_documents: {
        Row: {
          document_type: string
          file_url: string
          generated_at: string | null
          id: string
          order_id: string
        }
        Insert: {
          document_type: string
          file_url: string
          generated_at?: string | null
          id?: string
          order_id: string
        }
        Update: {
          document_type?: string
          file_url?: string
          generated_at?: string | null
          id?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_documents_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_milestones: {
        Row: {
          amount: number
          approved_at: string | null
          created_at: string | null
          description: string | null
          due_date: string | null
          id: string
          order_id: string
          status: string | null
          submitted_at: string | null
          title: string
        }
        Insert: {
          amount: number
          approved_at?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          order_id: string
          status?: string | null
          submitted_at?: string | null
          title: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          order_id?: string
          status?: string | null
          submitted_at?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_milestones_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_tasks: {
        Row: {
          created_at: string | null
          id: string
          order_id: string
          task_id: string
          task_type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          order_id: string
          task_id: string
          task_type: string
        }
        Update: {
          created_at?: string | null
          id?: string
          order_id?: string
          task_id?: string
          task_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_tasks_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_tasks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          buyer_id: string
          completed_at: string | null
          converted_from_trial_id: string | null
          created_at: string | null
          currency: string | null
          escrow_status: Database["public"]["Enums"]["escrow_status"] | null
          id: string
          is_trial: boolean | null
          listing_id: string | null
          objective_id: string | null
          order_number: string | null
          order_type: Database["public"]["Enums"]["order_type"]
          platform_fee: number | null
          seller_id: string
          status: Database["public"]["Enums"]["order_status"] | null
          stripe_payment_intent_id: string | null
          tax_treatment: string | null
          total_amount: number
          trial_converted_at: string | null
          trial_duration_weeks: number | null
          trial_hours_per_week: number | null
          vat_amount: number | null
          vat_rate: number | null
        }
        Insert: {
          buyer_id: string
          completed_at?: string | null
          converted_from_trial_id?: string | null
          created_at?: string | null
          currency?: string | null
          escrow_status?: Database["public"]["Enums"]["escrow_status"] | null
          id?: string
          is_trial?: boolean | null
          listing_id?: string | null
          objective_id?: string | null
          order_number?: string | null
          order_type: Database["public"]["Enums"]["order_type"]
          platform_fee?: number | null
          seller_id: string
          status?: Database["public"]["Enums"]["order_status"] | null
          stripe_payment_intent_id?: string | null
          tax_treatment?: string | null
          total_amount: number
          trial_converted_at?: string | null
          trial_duration_weeks?: number | null
          trial_hours_per_week?: number | null
          vat_amount?: number | null
          vat_rate?: number | null
        }
        Update: {
          buyer_id?: string
          completed_at?: string | null
          converted_from_trial_id?: string | null
          created_at?: string | null
          currency?: string | null
          escrow_status?: Database["public"]["Enums"]["escrow_status"] | null
          id?: string
          is_trial?: boolean | null
          listing_id?: string | null
          objective_id?: string | null
          order_number?: string | null
          order_type?: Database["public"]["Enums"]["order_type"]
          platform_fee?: number | null
          seller_id?: string
          status?: Database["public"]["Enums"]["order_status"] | null
          stripe_payment_intent_id?: string | null
          tax_treatment?: string | null
          total_amount?: number
          trial_converted_at?: string | null
          trial_duration_weeks?: number | null
          trial_hours_per_week?: number | null
          vat_amount?: number | null
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_converted_from_trial_id_fkey"
            columns: ["converted_from_trial_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "supplier_search_ranking"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "orders_objective_id_fkey"
            columns: ["objective_id"]
            isOneToOne: false
            referencedRelation: "objectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "provider_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "provider_stats"
            referencedColumns: ["provider_id"]
          },
          {
            foreignKeyName: "orders_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "supplier_search_ranking"
            referencedColumns: ["provider_id"]
          },
        ]
      }
      otjt_time_logs: {
        Row: {
          activity_type: string
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          description: string | null
          enrollment_id: string
          evidence_url: string | null
          hours: number
          id: string
          learning_outcomes: string | null
          log_date: string
          module_id: string | null
          query_message: string | null
          rejection_reason: string | null
          status: string | null
          task_id: string | null
          updated_at: string | null
        }
        Insert: {
          activity_type: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          description?: string | null
          enrollment_id: string
          evidence_url?: string | null
          hours: number
          id?: string
          learning_outcomes?: string | null
          log_date: string
          module_id?: string | null
          query_message?: string | null
          rejection_reason?: string | null
          status?: string | null
          task_id?: string | null
          updated_at?: string | null
        }
        Update: {
          activity_type?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          description?: string | null
          enrollment_id?: string
          evidence_url?: string | null
          hours?: number
          id?: string
          learning_outcomes?: string | null
          log_date?: string
          module_id?: string | null
          query_message?: string | null
          rejection_reason?: string | null
          status?: string | null
          task_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "otjt_time_logs_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "otjt_time_logs_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "otjt_time_logs_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "apprenticeship_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "otjt_time_logs_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "learning_modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "otjt_time_logs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_campaigns: {
        Row: {
          case_studies: Json
          created_at: string
          created_by: string | null
          foundry_id: string
          icp_description: string | null
          id: string
          metadata: Json
          name: string
          product_context: string | null
          sequence_length: number
          status: string
          tone: string
          updated_at: string
          value_props: Json
        }
        Insert: {
          case_studies?: Json
          created_at?: string
          created_by?: string | null
          foundry_id: string
          icp_description?: string | null
          id?: string
          metadata?: Json
          name?: string
          product_context?: string | null
          sequence_length?: number
          status?: string
          tone?: string
          updated_at?: string
          value_props?: Json
        }
        Update: {
          case_studies?: Json
          created_at?: string
          created_by?: string | null
          foundry_id?: string
          icp_description?: string | null
          id?: string
          metadata?: Json
          name?: string
          product_context?: string | null
          sequence_length?: number
          status?: string
          tone?: string
          updated_at?: string
          value_props?: Json
        }
        Relationships: [
          {
            foreignKeyName: "outreach_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "outreach_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_campaigns_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_contacts: {
        Row: {
          campaign_id: string | null
          company_domain: string | null
          company_name: string
          company_size: string | null
          created_at: string
          created_by: string | null
          email: string | null
          first_name: string
          foundry_id: string
          funding_stage: string | null
          id: string
          industry: string | null
          job_title: string | null
          last_name: string
          linkedin_url: string | null
          pain_points: Json
          recommended_angle: string | null
          research_brief: string | null
          score: number | null
          score_reasoning: string | null
          signals: Json
          status: string
          tech_stack: Json
          updated_at: string
        }
        Insert: {
          campaign_id?: string | null
          company_domain?: string | null
          company_name?: string
          company_size?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          first_name?: string
          foundry_id: string
          funding_stage?: string | null
          id?: string
          industry?: string | null
          job_title?: string | null
          last_name?: string
          linkedin_url?: string | null
          pain_points?: Json
          recommended_angle?: string | null
          research_brief?: string | null
          score?: number | null
          score_reasoning?: string | null
          signals?: Json
          status?: string
          tech_stack?: Json
          updated_at?: string
        }
        Update: {
          campaign_id?: string | null
          company_domain?: string | null
          company_name?: string
          company_size?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          first_name?: string
          foundry_id?: string
          funding_stage?: string | null
          id?: string
          industry?: string | null
          job_title?: string | null
          last_name?: string
          linkedin_url?: string | null
          pain_points?: Json
          recommended_angle?: string | null
          research_brief?: string | null
          score?: number | null
          score_reasoning?: string | null
          signals?: Json
          status?: string
          tech_stack?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_contacts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "outreach_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "outreach_contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_contacts_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_emails: {
        Row: {
          body: string
          campaign_id: string
          channel: string
          contact_id: string
          created_at: string
          created_by: string | null
          foundry_id: string
          id: string
          opened_at: string | null
          personalization_data: Json
          qa_passed: boolean | null
          qa_report: Json | null
          replied_at: string | null
          scheduled_at: string | null
          send_delay_days: number
          sent_at: string | null
          sequence_label: string | null
          sequence_position: number
          status: string
          subject: string
          subject_variants: Json
          updated_at: string
        }
        Insert: {
          body?: string
          campaign_id: string
          channel?: string
          contact_id: string
          created_at?: string
          created_by?: string | null
          foundry_id: string
          id?: string
          opened_at?: string | null
          personalization_data?: Json
          qa_passed?: boolean | null
          qa_report?: Json | null
          replied_at?: string | null
          scheduled_at?: string | null
          send_delay_days?: number
          sent_at?: string | null
          sequence_label?: string | null
          sequence_position?: number
          status?: string
          subject?: string
          subject_variants?: Json
          updated_at?: string
        }
        Update: {
          body?: string
          campaign_id?: string
          channel?: string
          contact_id?: string
          created_at?: string
          created_by?: string | null
          foundry_id?: string
          id?: string
          opened_at?: string | null
          personalization_data?: Json
          qa_passed?: boolean | null
          qa_report?: Json | null
          replied_at?: string | null
          scheduled_at?: string | null
          send_delay_days?: number
          sent_at?: string | null
          sequence_label?: string | null
          sequence_position?: number
          status?: string
          subject?: string
          subject_variants?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_emails_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "outreach_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_emails_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "outreach_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_emails_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "outreach_emails_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_emails_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_knowledge_base: {
        Row: {
          category: string
          content: string
          content_type: string
          created_at: string
          created_by: string | null
          foundry_id: string
          id: string
          tags: Json
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          content?: string
          content_type?: string
          created_at?: string
          created_by?: string | null
          foundry_id: string
          id?: string
          tags?: Json
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          content?: string
          content_type?: string
          created_at?: string
          created_by?: string | null
          foundry_id?: string
          id?: string
          tags?: Json
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_knowledge_base_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "outreach_knowledge_base_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_knowledge_base_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
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
      payout_preferences: {
        Row: {
          created_at: string | null
          id: string
          instant_payout_enabled: boolean | null
          minimum_payout_amount: number | null
          payout_schedule: string | null
          preferred_payout_day: number | null
          provider_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          instant_payout_enabled?: boolean | null
          minimum_payout_amount?: number | null
          payout_schedule?: string | null
          preferred_payout_day?: number | null
          provider_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          instant_payout_enabled?: boolean | null
          minimum_payout_amount?: number | null
          payout_schedule?: string | null
          preferred_payout_day?: number | null
          provider_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payout_preferences_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: true
            referencedRelation: "provider_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_preferences_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: true
            referencedRelation: "provider_stats"
            referencedColumns: ["provider_id"]
          },
          {
            foreignKeyName: "payout_preferences_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: true
            referencedRelation: "supplier_search_ranking"
            referencedColumns: ["provider_id"]
          },
        ]
      }
      payout_requests: {
        Row: {
          amount: number
          completed_at: string | null
          currency: string | null
          failure_reason: string | null
          id: string
          processed_at: string | null
          provider_id: string
          requested_at: string | null
          status: string | null
          stripe_payout_id: string | null
        }
        Insert: {
          amount: number
          completed_at?: string | null
          currency?: string | null
          failure_reason?: string | null
          id?: string
          processed_at?: string | null
          provider_id: string
          requested_at?: string | null
          status?: string | null
          stripe_payout_id?: string | null
        }
        Update: {
          amount?: number
          completed_at?: string | null
          currency?: string | null
          failure_reason?: string | null
          id?: string
          processed_at?: string | null
          provider_id?: string
          requested_at?: string | null
          status?: string | null
          stripe_payout_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payout_requests_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "provider_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_requests_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "provider_stats"
            referencedColumns: ["provider_id"]
          },
          {
            foreignKeyName: "payout_requests_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "supplier_search_ranking"
            referencedColumns: ["provider_id"]
          },
        ]
      }
      pending_intents: {
        Row: {
          confirmation_message_id: string | null
          created_at: string | null
          expires_at: string | null
          foundry_id: string
          id: string
          messaging_link_id: string | null
          original_message: string
          parsed_objective: Json
          platform: string
          platform_message_id: string | null
          platform_user_id: string
          profile_id: string
          status: string | null
          transcribed_text: string | null
          updated_at: string | null
        }
        Insert: {
          confirmation_message_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          foundry_id: string
          id?: string
          messaging_link_id?: string | null
          original_message: string
          parsed_objective: Json
          platform: string
          platform_message_id?: string | null
          platform_user_id: string
          profile_id: string
          status?: string | null
          transcribed_text?: string | null
          updated_at?: string | null
        }
        Update: {
          confirmation_message_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          foundry_id?: string
          id?: string
          messaging_link_id?: string | null
          original_message?: string
          parsed_objective?: Json
          platform?: string
          platform_message_id?: string | null
          platform_user_id?: string
          profile_id?: string
          status?: string | null
          transcribed_text?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pending_intents_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_intents_messaging_link_id_fkey"
            columns: ["messaging_link_id"]
            isOneToOne: false
            referencedRelation: "messaging_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_intents_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "pending_intents_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pinned_messages: {
        Row: {
          conversation_id: string
          created_at: string | null
          id: string
          message_id: string
          pinned_by: string | null
        }
        Insert: {
          conversation_id: string
          created_at?: string | null
          id?: string
          message_id: string
          pinned_by?: string | null
        }
        Update: {
          conversation_id?: string
          created_at?: string | null
          id?: string
          message_id?: string
          pinned_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pinned_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pinned_messages_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pinned_messages_pinned_by_fkey"
            columns: ["pinned_by"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "pinned_messages_pinned_by_fkey"
            columns: ["pinned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pitch_prep_requests: {
        Row: {
          additional_files: string[] | null
          amount_seeking: string | null
          company_name: string
          company_website: string | null
          competitive_landscape: string | null
          created_at: string
          financial_model_url: string | null
          founder_count: number | null
          founding_date: string | null
          foundry_id: string
          has_revenue: boolean
          headquarters: string | null
          id: string
          key_team_members: Json | null
          legal_structure: Database["public"]["Enums"]["legal_structure"] | null
          matched_provider_id: string | null
          pitch_deck_url: string | null
          problem_solved: string | null
          product_description: string
          services_requested: string[]
          specific_questions: string | null
          stage: Database["public"]["Enums"]["funding_stage"]
          status: Database["public"]["Enums"]["pitch_prep_status"]
          target_investor_types: string[] | null
          target_market: string | null
          team_size: number | null
          timeline: string | null
          traction_summary: string | null
          updated_at: string
          use_of_funds: string | null
          user_id: string
        }
        Insert: {
          additional_files?: string[] | null
          amount_seeking?: string | null
          company_name: string
          company_website?: string | null
          competitive_landscape?: string | null
          created_at?: string
          financial_model_url?: string | null
          founder_count?: number | null
          founding_date?: string | null
          foundry_id: string
          has_revenue?: boolean
          headquarters?: string | null
          id?: string
          key_team_members?: Json | null
          legal_structure?:
            | Database["public"]["Enums"]["legal_structure"]
            | null
          matched_provider_id?: string | null
          pitch_deck_url?: string | null
          problem_solved?: string | null
          product_description: string
          services_requested?: string[]
          specific_questions?: string | null
          stage: Database["public"]["Enums"]["funding_stage"]
          status?: Database["public"]["Enums"]["pitch_prep_status"]
          target_investor_types?: string[] | null
          target_market?: string | null
          team_size?: number | null
          timeline?: string | null
          traction_summary?: string | null
          updated_at?: string
          use_of_funds?: string | null
          user_id: string
        }
        Update: {
          additional_files?: string[] | null
          amount_seeking?: string | null
          company_name?: string
          company_website?: string | null
          competitive_landscape?: string | null
          created_at?: string
          financial_model_url?: string | null
          founder_count?: number | null
          founding_date?: string | null
          foundry_id?: string
          has_revenue?: boolean
          headquarters?: string | null
          id?: string
          key_team_members?: Json | null
          legal_structure?:
            | Database["public"]["Enums"]["legal_structure"]
            | null
          matched_provider_id?: string | null
          pitch_deck_url?: string | null
          problem_solved?: string | null
          product_description?: string
          services_requested?: string[]
          specific_questions?: string | null
          stage?: Database["public"]["Enums"]["funding_stage"]
          status?: Database["public"]["Enums"]["pitch_prep_status"]
          target_investor_types?: string[] | null
          target_market?: string | null
          team_size?: number | null
          timeline?: string | null
          traction_summary?: string | null
          updated_at?: string
          use_of_funds?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pitch_prep_requests_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pitch_prep_requests_matched_provider_id_fkey"
            columns: ["matched_provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      placed_components: {
        Row: {
          assembly_id: string
          catalogue_id: string | null
          connections: Json | null
          created_at: string | null
          custom_params: Json | null
          geometry_type_slug: string | null
          id: string
          label: string | null
          position: Json
          quantity: number | null
          rotation: Json
        }
        Insert: {
          assembly_id: string
          catalogue_id?: string | null
          connections?: Json | null
          created_at?: string | null
          custom_params?: Json | null
          geometry_type_slug?: string | null
          id?: string
          label?: string | null
          position?: Json
          quantity?: number | null
          rotation?: Json
        }
        Update: {
          assembly_id?: string
          catalogue_id?: string | null
          connections?: Json | null
          created_at?: string | null
          custom_params?: Json | null
          geometry_type_slug?: string | null
          id?: string
          label?: string | null
          position?: Json
          quantity?: number | null
          rotation?: Json
        }
        Relationships: [
          {
            foreignKeyName: "placed_components_assembly_id_fkey"
            columns: ["assembly_id"]
            isOneToOne: false
            referencedRelation: "cad_assemblies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "placed_components_catalogue_id_fkey"
            columns: ["catalogue_id"]
            isOneToOne: false
            referencedRelation: "component_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "placed_components_geometry_type_slug_fkey"
            columns: ["geometry_type_slug"]
            isOneToOne: false
            referencedRelation: "component_geometry_types"
            referencedColumns: ["slug"]
          },
        ]
      }
      platform_discounts: {
        Row: {
          created_at: string | null
          discount_percent: number
          discount_type: string
          id: string
          min_order_value: number | null
          provider_id: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          created_at?: string | null
          discount_percent: number
          discount_type: string
          id?: string
          min_order_value?: number | null
          provider_id: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          created_at?: string | null
          discount_percent?: number
          discount_type?: string
          id?: string
          min_order_value?: number | null
          provider_id?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_discounts_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "provider_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_discounts_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "provider_stats"
            referencedColumns: ["provider_id"]
          },
          {
            foreignKeyName: "platform_discounts_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "supplier_search_ranking"
            referencedColumns: ["provider_id"]
          },
        ]
      }
      platform_fee_config: {
        Row: {
          created_at: string | null
          effective_from: string | null
          effective_until: string | null
          fee_percent: number
          id: string
          max_fee_amount: number | null
          min_fee_amount: number | null
          order_type: string
          role: string
        }
        Insert: {
          created_at?: string | null
          effective_from?: string | null
          effective_until?: string | null
          fee_percent: number
          id?: string
          max_fee_amount?: number | null
          min_fee_amount?: number | null
          order_type: string
          role: string
        }
        Update: {
          created_at?: string | null
          effective_from?: string | null
          effective_until?: string | null
          fee_percent?: number
          id?: string
          max_fee_amount?: number | null
          min_fee_amount?: number | null
          order_type?: string
          role?: string
        }
        Relationships: []
      }
      platform_metrics: {
        Row: {
          id: string
          metric_name: string
          metric_value: number
          recorded_at: string | null
        }
        Insert: {
          id?: string
          metric_name: string
          metric_value: number
          recorded_at?: string | null
        }
        Update: {
          id?: string
          metric_name?: string
          metric_value?: number
          recorded_at?: string | null
        }
        Relationships: []
      }
      popular_searches: {
        Row: {
          category: string | null
          created_at: string | null
          id: string
          last_searched_at: string | null
          query: string
          search_count: number | null
          trending: boolean | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          id?: string
          last_searched_at?: string | null
          query: string
          search_count?: number | null
          trending?: boolean | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          id?: string
          last_searched_at?: string | null
          query?: string
          search_count?: number | null
          trending?: boolean | null
        }
        Relationships: []
      }
      preferred_suppliers: {
        Row: {
          auto_notify_on_availability: boolean | null
          buyer_id: string
          created_at: string | null
          id: string
          notes: string | null
          provider_id: string
        }
        Insert: {
          auto_notify_on_availability?: boolean | null
          buyer_id: string
          created_at?: string | null
          id?: string
          notes?: string | null
          provider_id: string
        }
        Update: {
          auto_notify_on_availability?: boolean | null
          buyer_id?: string
          created_at?: string | null
          id?: string
          notes?: string | null
          provider_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "preferred_suppliers_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "preferred_suppliers_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preferred_suppliers_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "provider_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preferred_suppliers_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "provider_stats"
            referencedColumns: ["provider_id"]
          },
          {
            foreignKeyName: "preferred_suppliers_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "supplier_search_ranking"
            referencedColumns: ["provider_id"]
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
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
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
      profile_views: {
        Row: {
          id: string
          provider_id: string
          source: string | null
          viewed_at: string | null
          viewer_id: string | null
        }
        Insert: {
          id?: string
          provider_id: string
          source?: string | null
          viewed_at?: string | null
          viewer_id?: string | null
        }
        Update: {
          id?: string
          provider_id?: string
          source?: string | null
          viewed_at?: string | null
          viewer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_views_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "provider_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_views_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "provider_stats"
            referencedColumns: ["provider_id"]
          },
          {
            foreignKeyName: "profile_views_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "supplier_search_ranking"
            referencedColumns: ["provider_id"]
          },
          {
            foreignKeyName: "profile_views_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "profile_views_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"] | null
          active_foundry_id: string | null
          availability_hours_per_week: number | null
          availability_type: string | null
          avatar_url: string | null
          bio: string | null
          capacity_score: number | null
          created_at: string | null
          deactivated_at: string | null
          email: string
          executive_onboarding_completed: boolean | null
          expertise_areas: string[] | null
          foundry_id: string
          full_name: string | null
          headline: string | null
          id: string
          industries: string[] | null
          is_active: boolean
          linkedin_url: string | null
          looking_for: string[] | null
          onboarding_data: Json
          paired_ai_id: string | null
          phone_number: string | null
          preferred_currency: string | null
          primary_function_id: string | null
          professional_background: Json | null
          role: Database["public"]["Enums"]["member_role"]
          skills: string[] | null
          stripe_account_id: string | null
          stripe_customer_id: string | null
          updated_at: string | null
          years_experience: number | null
        }
        Insert: {
          account_type?: Database["public"]["Enums"]["account_type"] | null
          active_foundry_id?: string | null
          availability_hours_per_week?: number | null
          availability_type?: string | null
          avatar_url?: string | null
          bio?: string | null
          capacity_score?: number | null
          created_at?: string | null
          deactivated_at?: string | null
          email: string
          executive_onboarding_completed?: boolean | null
          expertise_areas?: string[] | null
          foundry_id: string
          full_name?: string | null
          headline?: string | null
          id: string
          industries?: string[] | null
          is_active?: boolean
          linkedin_url?: string | null
          looking_for?: string[] | null
          onboarding_data?: Json
          paired_ai_id?: string | null
          phone_number?: string | null
          preferred_currency?: string | null
          primary_function_id?: string | null
          professional_background?: Json | null
          role?: Database["public"]["Enums"]["member_role"]
          skills?: string[] | null
          stripe_account_id?: string | null
          stripe_customer_id?: string | null
          updated_at?: string | null
          years_experience?: number | null
        }
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"] | null
          active_foundry_id?: string | null
          availability_hours_per_week?: number | null
          availability_type?: string | null
          avatar_url?: string | null
          bio?: string | null
          capacity_score?: number | null
          created_at?: string | null
          deactivated_at?: string | null
          email?: string
          executive_onboarding_completed?: boolean | null
          expertise_areas?: string[] | null
          foundry_id?: string
          full_name?: string | null
          headline?: string | null
          id?: string
          industries?: string[] | null
          is_active?: boolean
          linkedin_url?: string | null
          looking_for?: string[] | null
          onboarding_data?: Json
          paired_ai_id?: string | null
          phone_number?: string | null
          preferred_currency?: string | null
          primary_function_id?: string | null
          professional_background?: Json | null
          role?: Database["public"]["Enums"]["member_role"]
          skills?: string[] | null
          stripe_account_id?: string | null
          stripe_customer_id?: string | null
          updated_at?: string | null
          years_experience?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_foundry_id_fkey"
            columns: ["active_foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_paired_ai_id_fkey"
            columns: ["paired_ai_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "profiles_paired_ai_id_fkey"
            columns: ["paired_ai_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_primary_function_id_fkey"
            columns: ["primary_function_id"]
            isOneToOne: false
            referencedRelation: "business_functions"
            referencedColumns: ["id"]
          },
        ]
      }
      progress_reviews: {
        Row: {
          action_items: Json | null
          apprentice_reflection: string | null
          apprentice_signed_at: string | null
          areas_for_improvement: Json | null
          completed_date: string | null
          created_at: string | null
          duration_minutes: number | null
          enrollment_id: string
          epa_recommendation: string | null
          gateway_ready: boolean | null
          id: string
          mentor_feedback: string | null
          mentor_signed_at: string | null
          objectives_met: Json | null
          on_track: boolean | null
          otjt_hours_in_period: number | null
          otjt_target_for_period: number | null
          overall_rating: number | null
          review_type: string
          reviewer_id: string
          scheduled_date: string | null
          skills_demonstrated: Json | null
          updated_at: string | null
        }
        Insert: {
          action_items?: Json | null
          apprentice_reflection?: string | null
          apprentice_signed_at?: string | null
          areas_for_improvement?: Json | null
          completed_date?: string | null
          created_at?: string | null
          duration_minutes?: number | null
          enrollment_id: string
          epa_recommendation?: string | null
          gateway_ready?: boolean | null
          id?: string
          mentor_feedback?: string | null
          mentor_signed_at?: string | null
          objectives_met?: Json | null
          on_track?: boolean | null
          otjt_hours_in_period?: number | null
          otjt_target_for_period?: number | null
          overall_rating?: number | null
          review_type: string
          reviewer_id: string
          scheduled_date?: string | null
          skills_demonstrated?: Json | null
          updated_at?: string | null
        }
        Update: {
          action_items?: Json | null
          apprentice_reflection?: string | null
          apprentice_signed_at?: string | null
          areas_for_improvement?: Json | null
          completed_date?: string | null
          created_at?: string | null
          duration_minutes?: number | null
          enrollment_id?: string
          epa_recommendation?: string | null
          gateway_ready?: boolean | null
          id?: string
          mentor_feedback?: string | null
          mentor_signed_at?: string | null
          objectives_met?: Json | null
          on_track?: boolean | null
          otjt_hours_in_period?: number | null
          otjt_target_for_period?: number | null
          overall_rating?: number | null
          review_type?: string
          reviewer_id?: string
          scheduled_date?: string | null
          skills_demonstrated?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "progress_reviews_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "apprenticeship_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progress_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "progress_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_assignments: {
        Row: {
          apprentice_id: string
          assigned_by: string
          created_at: string | null
          ended_at: string | null
          foundry_id: string
          id: string
          notes: string | null
          project_description: string | null
          project_name: string | null
          started_at: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          apprentice_id: string
          assigned_by: string
          created_at?: string | null
          ended_at?: string | null
          foundry_id: string
          id?: string
          notes?: string | null
          project_description?: string | null
          project_name?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          apprentice_id?: string
          assigned_by?: string
          created_at?: string | null
          ended_at?: string | null
          foundry_id?: string
          id?: string
          notes?: string | null
          project_description?: string | null
          project_name?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_assignments_apprentice_id_fkey"
            columns: ["apprentice_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "project_assignments_apprentice_id_fkey"
            columns: ["apprentice_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "project_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_templates: {
        Row: {
          bom: Json | null
          category: string | null
          created_at: string
          description: string | null
          difficulty: string | null
          embedding: string | null
          estimated_cost_usd: number | null
          estimated_hours: number | null
          id: string
          references: string[] | null
          safety_warnings: string[] | null
          skills_required: string[] | null
          slug: string
          steps: Json
          tags: string[] | null
          title: string
          tools_required: string[] | null
        }
        Insert: {
          bom?: Json | null
          category?: string | null
          created_at?: string
          description?: string | null
          difficulty?: string | null
          embedding?: string | null
          estimated_cost_usd?: number | null
          estimated_hours?: number | null
          id?: string
          references?: string[] | null
          safety_warnings?: string[] | null
          skills_required?: string[] | null
          slug: string
          steps?: Json
          tags?: string[] | null
          title: string
          tools_required?: string[] | null
        }
        Update: {
          bom?: Json | null
          category?: string | null
          created_at?: string
          description?: string | null
          difficulty?: string | null
          embedding?: string | null
          estimated_cost_usd?: number | null
          estimated_hours?: number | null
          id?: string
          references?: string[] | null
          safety_warnings?: string[] | null
          skills_required?: string[] | null
          slug?: string
          steps?: Json
          tags?: string[] | null
          title?: string
          tools_required?: string[] | null
        }
        Relationships: []
      }
      provider_applications: {
        Row: {
          application_data: Json | null
          assigned_tier: Database["public"]["Enums"]["supplier_tier"] | null
          category: string
          company_name: string | null
          id: string
          reviewed_at: string | null
          reviewer_id: string | null
          reviewer_notes: string | null
          status: string | null
          submitted_at: string | null
          user_id: string | null
        }
        Insert: {
          application_data?: Json | null
          assigned_tier?: Database["public"]["Enums"]["supplier_tier"] | null
          category: string
          company_name?: string | null
          id?: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          reviewer_notes?: string | null
          status?: string | null
          submitted_at?: string | null
          user_id?: string | null
        }
        Update: {
          application_data?: Json | null
          assigned_tier?: Database["public"]["Enums"]["supplier_tier"] | null
          category?: string
          company_name?: string | null
          id?: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          reviewer_notes?: string | null
          status?: string | null
          submitted_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_applications_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "provider_applications_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "provider_applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_badges: {
        Row: {
          badge_type: string
          earned_at: string | null
          id: string
          provider_id: string
        }
        Insert: {
          badge_type: string
          earned_at?: string | null
          id?: string
          provider_id: string
        }
        Update: {
          badge_type?: string
          earned_at?: string | null
          id?: string
          provider_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_badges_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "provider_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_badges_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "provider_stats"
            referencedColumns: ["provider_id"]
          },
          {
            foreignKeyName: "provider_badges_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "supplier_search_ranking"
            referencedColumns: ["provider_id"]
          },
        ]
      }
      provider_certifications: {
        Row: {
          certification_name: string
          created_at: string | null
          credential_id: string | null
          expiry_date: string | null
          id: string
          is_verified: boolean | null
          issued_date: string | null
          issuing_body: string
          provider_id: string
          verification_url: string | null
        }
        Insert: {
          certification_name: string
          created_at?: string | null
          credential_id?: string | null
          expiry_date?: string | null
          id?: string
          is_verified?: boolean | null
          issued_date?: string | null
          issuing_body: string
          provider_id: string
          verification_url?: string | null
        }
        Update: {
          certification_name?: string
          created_at?: string | null
          credential_id?: string | null
          expiry_date?: string | null
          id?: string
          is_verified?: boolean | null
          issued_date?: string | null
          issuing_body?: string
          provider_id?: string
          verification_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_certifications_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "provider_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_certifications_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "provider_stats"
            referencedColumns: ["provider_id"]
          },
          {
            foreignKeyName: "provider_certifications_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "supplier_search_ranking"
            referencedColumns: ["provider_id"]
          },
        ]
      }
      provider_portfolio: {
        Row: {
          client_name: string | null
          completion_date: string | null
          created_at: string | null
          description: string | null
          id: string
          image_urls: string[] | null
          is_featured: boolean | null
          project_url: string | null
          provider_id: string
          title: string
        }
        Insert: {
          client_name?: string | null
          completion_date?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_urls?: string[] | null
          is_featured?: boolean | null
          project_url?: string | null
          provider_id: string
          title: string
        }
        Update: {
          client_name?: string | null
          completion_date?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_urls?: string[] | null
          is_featured?: boolean | null
          project_url?: string | null
          provider_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_portfolio_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "provider_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_portfolio_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "provider_stats"
            referencedColumns: ["provider_id"]
          },
          {
            foreignKeyName: "provider_portfolio_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "supplier_search_ranking"
            referencedColumns: ["provider_id"]
          },
        ]
      }
      provider_profiles: {
        Row: {
          accepts_trial: boolean | null
          auto_pause_at_capacity: boolean | null
          auto_response_delay_minutes: number | null
          auto_response_enabled: boolean | null
          auto_response_message: string | null
          avg_response_time_hours: number | null
          bio: string | null
          company_stages: string[] | null
          completion_rate: number | null
          created_at: string | null
          currency: string | null
          current_order_count: number | null
          day_rate: number | null
          featured_until: string | null
          forge_discount_percent: number | null
          headline: string | null
          hourly_rate: number | null
          id: string
          industries: string[] | null
          is_active: boolean | null
          is_public: boolean | null
          last_active_at: string | null
          linkedin_url: string | null
          listing_id: string | null
          location: string | null
          max_concurrent_orders: number | null
          minimum_engagement_hours: number | null
          out_of_office: boolean | null
          out_of_office_message: string | null
          out_of_office_until: string | null
          profile_completeness: number | null
          profile_slug: string | null
          profile_views: number | null
          response_rate: number | null
          specializations: string[] | null
          stripe_account_id: string | null
          stripe_onboarding_complete: boolean | null
          tier: Database["public"]["Enums"]["supplier_tier"] | null
          timezone: string | null
          trial_rate_discount: number | null
          user_id: string
          username: string | null
          video_thumbnail_url: string | null
          video_url: string | null
          website_url: string | null
          years_experience: number | null
        }
        Insert: {
          accepts_trial?: boolean | null
          auto_pause_at_capacity?: boolean | null
          auto_response_delay_minutes?: number | null
          auto_response_enabled?: boolean | null
          auto_response_message?: string | null
          avg_response_time_hours?: number | null
          bio?: string | null
          company_stages?: string[] | null
          completion_rate?: number | null
          created_at?: string | null
          currency?: string | null
          current_order_count?: number | null
          day_rate?: number | null
          featured_until?: string | null
          forge_discount_percent?: number | null
          headline?: string | null
          hourly_rate?: number | null
          id?: string
          industries?: string[] | null
          is_active?: boolean | null
          is_public?: boolean | null
          last_active_at?: string | null
          linkedin_url?: string | null
          listing_id?: string | null
          location?: string | null
          max_concurrent_orders?: number | null
          minimum_engagement_hours?: number | null
          out_of_office?: boolean | null
          out_of_office_message?: string | null
          out_of_office_until?: string | null
          profile_completeness?: number | null
          profile_slug?: string | null
          profile_views?: number | null
          response_rate?: number | null
          specializations?: string[] | null
          stripe_account_id?: string | null
          stripe_onboarding_complete?: boolean | null
          tier?: Database["public"]["Enums"]["supplier_tier"] | null
          timezone?: string | null
          trial_rate_discount?: number | null
          user_id: string
          username?: string | null
          video_thumbnail_url?: string | null
          video_url?: string | null
          website_url?: string | null
          years_experience?: number | null
        }
        Update: {
          accepts_trial?: boolean | null
          auto_pause_at_capacity?: boolean | null
          auto_response_delay_minutes?: number | null
          auto_response_enabled?: boolean | null
          auto_response_message?: string | null
          avg_response_time_hours?: number | null
          bio?: string | null
          company_stages?: string[] | null
          completion_rate?: number | null
          created_at?: string | null
          currency?: string | null
          current_order_count?: number | null
          day_rate?: number | null
          featured_until?: string | null
          forge_discount_percent?: number | null
          headline?: string | null
          hourly_rate?: number | null
          id?: string
          industries?: string[] | null
          is_active?: boolean | null
          is_public?: boolean | null
          last_active_at?: string | null
          linkedin_url?: string | null
          listing_id?: string | null
          location?: string | null
          max_concurrent_orders?: number | null
          minimum_engagement_hours?: number | null
          out_of_office?: boolean | null
          out_of_office_message?: string | null
          out_of_office_until?: string | null
          profile_completeness?: number | null
          profile_slug?: string | null
          profile_views?: number | null
          response_rate?: number | null
          specializations?: string[] | null
          stripe_account_id?: string | null
          stripe_onboarding_complete?: boolean | null
          tier?: Database["public"]["Enums"]["supplier_tier"] | null
          timezone?: string | null
          trial_rate_discount?: number | null
          user_id?: string
          username?: string | null
          video_thumbnail_url?: string | null
          video_url?: string | null
          website_url?: string | null
          years_experience?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_profiles_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_profiles_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "supplier_search_ranking"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "provider_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "provider_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_ratings: {
        Row: {
          average_rating: number | null
          provider_id: string
          total_reviews: number | null
          total_transactions: number | null
          updated_at: string | null
        }
        Insert: {
          average_rating?: number | null
          provider_id: string
          total_reviews?: number | null
          total_transactions?: number | null
          updated_at?: string | null
        }
        Update: {
          average_rating?: number | null
          provider_id?: string
          total_reviews?: number | null
          total_transactions?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_ratings_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: true
            referencedRelation: "provider_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_ratings_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: true
            referencedRelation: "provider_stats"
            referencedColumns: ["provider_id"]
          },
          {
            foreignKeyName: "provider_ratings_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: true
            referencedRelation: "supplier_search_ranking"
            referencedColumns: ["provider_id"]
          },
        ]
      }
      qa_test_runs: {
        Row: {
          artifacts_url: string | null
          completed_at: string | null
          created_at: string
          duration_seconds: number | null
          environment: Database["public"]["Enums"]["qa_test_environment"]
          error_message: string | null
          foundry_id: string | null
          github_run_id: string | null
          github_run_url: string | null
          id: string
          results: Json | null
          started_at: string | null
          status: Database["public"]["Enums"]["qa_test_status"]
          triggered_by: string | null
          triggered_by_name: string | null
          updated_at: string
        }
        Insert: {
          artifacts_url?: string | null
          completed_at?: string | null
          created_at?: string
          duration_seconds?: number | null
          environment?: Database["public"]["Enums"]["qa_test_environment"]
          error_message?: string | null
          foundry_id?: string | null
          github_run_id?: string | null
          github_run_url?: string | null
          id?: string
          results?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["qa_test_status"]
          triggered_by?: string | null
          triggered_by_name?: string | null
          updated_at?: string
        }
        Update: {
          artifacts_url?: string | null
          completed_at?: string | null
          created_at?: string
          duration_seconds?: number | null
          environment?: Database["public"]["Enums"]["qa_test_environment"]
          error_message?: string | null
          foundry_id?: string | null
          github_run_id?: string | null
          github_run_url?: string | null
          id?: string
          results?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["qa_test_status"]
          triggered_by?: string | null
          triggered_by_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qa_test_runs_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qa_test_runs_triggered_by_fkey"
            columns: ["triggered_by"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "qa_test_runs_triggered_by_fkey"
            columns: ["triggered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          count: number | null
          created_at: string | null
          id: string
          key: string
          updated_at: string | null
          window_end: string
          window_start: string | null
        }
        Insert: {
          count?: number | null
          created_at?: string | null
          id?: string
          key: string
          updated_at?: string | null
          window_end: string
          window_start?: string | null
        }
        Update: {
          count?: number | null
          created_at?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          window_end?: string
          window_start?: string | null
        }
        Relationships: []
      }
      recent_searches: {
        Row: {
          created_at: string | null
          filters: Json | null
          id: string
          query: string
          results_count: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          filters?: Json | null
          id?: string
          query: string
          results_count?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          filters?: Json | null
          id?: string
          query?: string
          results_count?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recent_searches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "recent_searches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendation_feedback: {
        Row: {
          comment: string | null
          created_at: string
          feedback_type: string
          foundry_id: string
          id: string
          metadata: Json | null
          source_id: string | null
          source_type: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          feedback_type: string
          foundry_id: string
          id?: string
          metadata?: Json | null
          source_id?: string | null
          source_type: string
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          feedback_type?: string
          foundry_id?: string
          id?: string
          metadata?: Json | null
          source_id?: string | null
          source_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_feedback_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendation_feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "recommendation_feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reference_models: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          module_template: Json | null
          name: string
          search_keywords: string[]
          sort_order: number
          step_url: string | null
          stl_url: string | null
          thumbnail_svg: string | null
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          id?: string
          module_template?: Json | null
          name: string
          search_keywords?: string[]
          sort_order?: number
          step_url?: string | null
          stl_url?: string | null
          thumbnail_svg?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          module_template?: Json | null
          name?: string
          search_keywords?: string[]
          sort_order?: number
          step_url?: string | null
          stl_url?: string | null
          thumbnail_svg?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      report_preferences: {
        Row: {
          created_at: string | null
          daily_report_time: string | null
          email_enabled: boolean | null
          id: string
          include_insights: boolean | null
          include_summary: boolean | null
          include_team_activity: boolean | null
          include_trends: boolean | null
          last_scheduled_at: string | null
          profile_id: string
          schedule_day_of_month: number | null
          schedule_day_of_week: number | null
          schedule_detail_level: string | null
          schedule_enabled: boolean
          schedule_frequency: string | null
          schedule_recipients: string[] | null
          schedule_template: string | null
          schedule_tone: string | null
          slack_enabled: boolean | null
          slack_webhook_url: string | null
          telegram_enabled: boolean | null
          timezone: string | null
          updated_at: string | null
          weekly_report_day: number | null
        }
        Insert: {
          created_at?: string | null
          daily_report_time?: string | null
          email_enabled?: boolean | null
          id?: string
          include_insights?: boolean | null
          include_summary?: boolean | null
          include_team_activity?: boolean | null
          include_trends?: boolean | null
          last_scheduled_at?: string | null
          profile_id: string
          schedule_day_of_month?: number | null
          schedule_day_of_week?: number | null
          schedule_detail_level?: string | null
          schedule_enabled?: boolean
          schedule_frequency?: string | null
          schedule_recipients?: string[] | null
          schedule_template?: string | null
          schedule_tone?: string | null
          slack_enabled?: boolean | null
          slack_webhook_url?: string | null
          telegram_enabled?: boolean | null
          timezone?: string | null
          updated_at?: string | null
          weekly_report_day?: number | null
        }
        Update: {
          created_at?: string | null
          daily_report_time?: string | null
          email_enabled?: boolean | null
          id?: string
          include_insights?: boolean | null
          include_summary?: boolean | null
          include_team_activity?: boolean | null
          include_trends?: boolean | null
          last_scheduled_at?: string | null
          profile_id?: string
          schedule_day_of_month?: number | null
          schedule_day_of_week?: number | null
          schedule_detail_level?: string | null
          schedule_enabled?: boolean
          schedule_frequency?: string | null
          schedule_recipients?: string[] | null
          schedule_template?: string | null
          schedule_tone?: string | null
          slack_enabled?: boolean | null
          slack_webhook_url?: string | null
          telegram_enabled?: boolean | null
          timezone?: string | null
          updated_at?: string | null
          weekly_report_day?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "report_preferences_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "report_preferences_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      report_snapshots: {
        Row: {
          foundry_id: string
          generated_at: string | null
          id: string
          profile_id: string | null
          report_data: Json
          report_date: string
          report_type: string
          summary_text: string | null
        }
        Insert: {
          foundry_id: string
          generated_at?: string | null
          id?: string
          profile_id?: string | null
          report_data?: Json
          report_date: string
          report_type: string
          summary_text?: string | null
        }
        Update: {
          foundry_id?: string
          generated_at?: string | null
          id?: string
          profile_id?: string | null
          report_data?: Json
          report_date?: string
          report_type?: string
          summary_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_snapshots_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_snapshots_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "report_snapshots_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      retainers: {
        Row: {
          buyer_id: string
          cancellation_effective: string | null
          cancelled_at: string | null
          created_at: string | null
          currency: string | null
          hourly_rate: number
          id: string
          seller_id: string
          started_at: string | null
          status: string | null
          weekly_hours: number
        }
        Insert: {
          buyer_id: string
          cancellation_effective?: string | null
          cancelled_at?: string | null
          created_at?: string | null
          currency?: string | null
          hourly_rate: number
          id?: string
          seller_id: string
          started_at?: string | null
          status?: string | null
          weekly_hours: number
        }
        Update: {
          buyer_id?: string
          cancellation_effective?: string | null
          cancelled_at?: string | null
          created_at?: string | null
          currency?: string | null
          hourly_rate?: number
          id?: string
          seller_id?: string
          started_at?: string | null
          status?: string | null
          weekly_hours?: number
        }
        Relationships: [
          {
            foreignKeyName: "retainers_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "retainers_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retainers_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "provider_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retainers_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "provider_stats"
            referencedColumns: ["provider_id"]
          },
          {
            foreignKeyName: "retainers_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "supplier_search_ranking"
            referencedColumns: ["provider_id"]
          },
        ]
      }
      review_gates: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          foundry_id: string
          gate_type: string
          id: string
          objective_id: string | null
          required_skills: string[] | null
          review_notes: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          sector: string | null
          status: string
          task_id: string | null
          title: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          foundry_id: string
          gate_type: string
          id?: string
          objective_id?: string | null
          required_skills?: string[] | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          sector?: string | null
          status?: string
          task_id?: string | null
          title: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          foundry_id?: string
          gate_type?: string
          id?: string
          objective_id?: string | null
          required_skills?: string[] | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          sector?: string | null
          status?: string
          task_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_gates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "review_gates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_gates_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_gates_objective_id_fkey"
            columns: ["objective_id"]
            isOneToOne: false
            referencedRelation: "objectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_gates_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "review_gates_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_gates_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          comment: string | null
          created_at: string | null
          id: string
          is_public: boolean | null
          order_id: string
          rating: number
          reviewee_id: string
          reviewer_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string | null
          id?: string
          is_public?: boolean | null
          order_id: string
          rating: number
          reviewee_id: string
          reviewer_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string | null
          id?: string
          is_public?: boolean | null
          order_id?: string
          rating?: number
          reviewee_id?: string
          reviewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_reviewee_id_fkey"
            columns: ["reviewee_id"]
            isOneToOne: false
            referencedRelation: "provider_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_reviewee_id_fkey"
            columns: ["reviewee_id"]
            isOneToOne: false
            referencedRelation: "provider_stats"
            referencedColumns: ["provider_id"]
          },
          {
            foreignKeyName: "reviews_reviewee_id_fkey"
            columns: ["reviewee_id"]
            isOneToOne: false
            referencedRelation: "supplier_search_ranking"
            referencedColumns: ["provider_id"]
          },
          {
            foreignKeyName: "reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rfq_broadcasts: {
        Row: {
          created_at: string | null
          delivered_at: string | null
          id: string
          provider_id: string
          rfq_id: string
          scheduled_at: string
          viewed_at: string | null
        }
        Insert: {
          created_at?: string | null
          delivered_at?: string | null
          id?: string
          provider_id: string
          rfq_id: string
          scheduled_at: string
          viewed_at?: string | null
        }
        Update: {
          created_at?: string | null
          delivered_at?: string | null
          id?: string
          provider_id?: string
          rfq_id?: string
          scheduled_at?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rfq_broadcasts_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "provider_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_broadcasts_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "provider_stats"
            referencedColumns: ["provider_id"]
          },
          {
            foreignKeyName: "rfq_broadcasts_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "supplier_search_ranking"
            referencedColumns: ["provider_id"]
          },
          {
            foreignKeyName: "rfq_broadcasts_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
        ]
      }
      rfq_responses: {
        Row: {
          attachments: Json | null
          buyer_shortlisted: boolean | null
          buyer_viewed_at: string | null
          deliverables: Json | null
          id: string
          message: string | null
          milestones: Json | null
          pricing_breakdown: Json | null
          proposal_summary: string | null
          proposal_title: string | null
          provider_id: string
          quoted_price: number | null
          responded_at: string | null
          response_type: string
          rfq_id: string
          scope_of_work: string | null
          terms_and_conditions: string | null
          timeline_weeks: number | null
          updated_at: string | null
          valid_until: string | null
        }
        Insert: {
          attachments?: Json | null
          buyer_shortlisted?: boolean | null
          buyer_viewed_at?: string | null
          deliverables?: Json | null
          id?: string
          message?: string | null
          milestones?: Json | null
          pricing_breakdown?: Json | null
          proposal_summary?: string | null
          proposal_title?: string | null
          provider_id: string
          quoted_price?: number | null
          responded_at?: string | null
          response_type: string
          rfq_id: string
          scope_of_work?: string | null
          terms_and_conditions?: string | null
          timeline_weeks?: number | null
          updated_at?: string | null
          valid_until?: string | null
        }
        Update: {
          attachments?: Json | null
          buyer_shortlisted?: boolean | null
          buyer_viewed_at?: string | null
          deliverables?: Json | null
          id?: string
          message?: string | null
          milestones?: Json | null
          pricing_breakdown?: Json | null
          proposal_summary?: string | null
          proposal_title?: string | null
          provider_id?: string
          quoted_price?: number | null
          responded_at?: string | null
          response_type?: string
          rfq_id?: string
          scope_of_work?: string | null
          terms_and_conditions?: string | null
          timeline_weeks?: number | null
          updated_at?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rfq_responses_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "provider_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_responses_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "provider_stats"
            referencedColumns: ["provider_id"]
          },
          {
            foreignKeyName: "rfq_responses_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "supplier_search_ranking"
            referencedColumns: ["provider_id"]
          },
          {
            foreignKeyName: "rfq_responses_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
        ]
      }
      rfq_templates: {
        Row: {
          category: string | null
          created_at: string | null
          default_specifications: Json | null
          description: string | null
          display_order: number | null
          id: string
          is_manufacturing: boolean | null
          rfq_type: string
          sector: string | null
          title: string
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          default_specifications?: Json | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_manufacturing?: boolean | null
          rfq_type?: string
          sector?: string | null
          title: string
        }
        Update: {
          category?: string | null
          created_at?: string | null
          default_specifications?: Json | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_manufacturing?: boolean | null
          rfq_type?: string
          sector?: string | null
          title?: string
        }
        Relationships: []
      }
      rfqs: {
        Row: {
          awarded_to: string | null
          budget_max: number | null
          budget_min: number | null
          buyer_id: string
          category: string | null
          created_at: string | null
          deadline: string | null
          foundry_id: string
          id: string
          priority_hold_expires_at: string | null
          priority_holder_id: string | null
          race_opens_at: string | null
          rfq_type: Database["public"]["Enums"]["rfq_type"]
          specifications: Json | null
          status: Database["public"]["Enums"]["rfq_status"] | null
          title: string
          urgency: string | null
        }
        Insert: {
          awarded_to?: string | null
          budget_max?: number | null
          budget_min?: number | null
          buyer_id: string
          category?: string | null
          created_at?: string | null
          deadline?: string | null
          foundry_id: string
          id?: string
          priority_hold_expires_at?: string | null
          priority_holder_id?: string | null
          race_opens_at?: string | null
          rfq_type: Database["public"]["Enums"]["rfq_type"]
          specifications?: Json | null
          status?: Database["public"]["Enums"]["rfq_status"] | null
          title: string
          urgency?: string | null
        }
        Update: {
          awarded_to?: string | null
          budget_max?: number | null
          budget_min?: number | null
          buyer_id?: string
          category?: string | null
          created_at?: string | null
          deadline?: string | null
          foundry_id?: string
          id?: string
          priority_hold_expires_at?: string | null
          priority_holder_id?: string | null
          race_opens_at?: string | null
          rfq_type?: Database["public"]["Enums"]["rfq_type"]
          specifications?: Json | null
          status?: Database["public"]["Enums"]["rfq_status"] | null
          title?: string
          urgency?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rfqs_awarded_to_fkey"
            columns: ["awarded_to"]
            isOneToOne: false
            referencedRelation: "provider_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfqs_awarded_to_fkey"
            columns: ["awarded_to"]
            isOneToOne: false
            referencedRelation: "provider_stats"
            referencedColumns: ["provider_id"]
          },
          {
            foreignKeyName: "rfqs_awarded_to_fkey"
            columns: ["awarded_to"]
            isOneToOne: false
            referencedRelation: "supplier_search_ranking"
            referencedColumns: ["provider_id"]
          },
          {
            foreignKeyName: "rfqs_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "rfqs_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfqs_priority_holder_id_fkey"
            columns: ["priority_holder_id"]
            isOneToOne: false
            referencedRelation: "provider_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfqs_priority_holder_id_fkey"
            columns: ["priority_holder_id"]
            isOneToOne: false
            referencedRelation: "provider_stats"
            referencedColumns: ["provider_id"]
          },
          {
            foreignKeyName: "rfqs_priority_holder_id_fkey"
            columns: ["priority_holder_id"]
            isOneToOne: false
            referencedRelation: "supplier_search_ranking"
            referencedColumns: ["provider_id"]
          },
        ]
      }
      saved_marketplace_listings: {
        Row: {
          created_at: string
          id: string
          listing_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_marketplace_listings_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_marketplace_listings_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "supplier_search_ranking"
            referencedColumns: ["listing_id"]
          },
        ]
      }
      saved_packs: {
        Row: {
          created_at: string
          id: string
          pack_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          pack_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          pack_id?: string
          user_id?: string
        }
        Relationships: []
      }
      saved_payment_methods: {
        Row: {
          billing_email: string | null
          billing_name: string | null
          card_brand: string | null
          card_exp_month: number | null
          card_exp_year: number | null
          card_last_four: string | null
          created_at: string | null
          id: string
          is_default: boolean | null
          stripe_payment_method_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          billing_email?: string | null
          billing_name?: string | null
          card_brand?: string | null
          card_exp_month?: number | null
          card_exp_year?: number | null
          card_last_four?: string | null
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          stripe_payment_method_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          billing_email?: string | null
          billing_name?: string | null
          card_brand?: string | null
          card_exp_month?: number | null
          card_exp_year?: number | null
          card_last_four?: string | null
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          stripe_payment_method_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_payment_methods_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "saved_payment_methods_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_searches: {
        Row: {
          alert_frequency: string | null
          created_at: string | null
          filters: Json | null
          id: string
          is_alert_enabled: boolean | null
          last_alerted_at: string | null
          name: string
          query: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          alert_frequency?: string | null
          created_at?: string | null
          filters?: Json | null
          id?: string
          is_alert_enabled?: boolean | null
          last_alerted_at?: string | null
          name: string
          query?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          alert_frequency?: string | null
          created_at?: string | null
          filters?: Json | null
          id?: string
          is_alert_enabled?: boolean | null
          last_alerted_at?: string | null
          name?: string
          query?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_searches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "saved_searches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sector_skills: {
        Row: {
          created_at: string | null
          id: string
          is_expert_level: boolean | null
          sector: string
          skill_category: string
          skill_name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_expert_level?: boolean | null
          sector: string
          skill_category: string
          skill_name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_expert_level?: boolean | null
          sector?: string
          skill_category?: string
          skill_name?: string
        }
        Relationships: []
      }
      security_audit_log: {
        Row: {
          action: string | null
          created_at: string
          details: Json | null
          email: string | null
          event_type: string
          id: string
          ip_address: string | null
          resource: string | null
          severity: string
          success: boolean
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action?: string | null
          created_at?: string
          details?: Json | null
          email?: string | null
          event_type: string
          id?: string
          ip_address?: string | null
          resource?: string | null
          severity: string
          success?: boolean
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string | null
          created_at?: string
          details?: Json | null
          email?: string | null
          event_type?: string
          id?: string
          ip_address?: string | null
          resource?: string | null
          severity?: string
          success?: boolean
          user_agent?: string | null
          user_id?: string | null
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
      shared_artifacts: {
        Row: {
          artifact_id: string
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          share_token: string
          view_count: number
        }
        Insert: {
          artifact_id: string
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          share_token: string
          view_count?: number
        }
        Update: {
          artifact_id?: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          share_token?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "shared_artifacts_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "agent_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_artifacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "shared_artifacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_reports: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string | null
          foundry_id: string
          id: string
          report_snapshot_id: string
          share_token: string
          view_count: number
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at?: string | null
          foundry_id: string
          id?: string
          report_snapshot_id: string
          share_token: string
          view_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string | null
          foundry_id?: string
          id?: string
          report_snapshot_id?: string
          share_token?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "shared_reports_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_reports_report_snapshot_id_fkey"
            columns: ["report_snapshot_id"]
            isOneToOne: false
            referencedRelation: "report_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      signup_intents: {
        Row: {
          created_at: string
          fulfilled_at: string | null
          id: string
          intent_type: string
          listing_id: string | null
          metadata: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          fulfilled_at?: string | null
          id?: string
          intent_type: string
          listing_id?: string | null
          metadata?: Json
          user_id: string
        }
        Update: {
          created_at?: string
          fulfilled_at?: string | null
          id?: string
          intent_type?: string
          listing_id?: string | null
          metadata?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "signup_intents_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signup_intents_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "supplier_search_ranking"
            referencedColumns: ["listing_id"]
          },
        ]
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
        }
        Relationships: []
      }
      specialist_briefings: {
        Row: {
          briefing_type: string
          created_at: string
          domain_impact: string
          estimated_cost_usd: number | null
          foundry_id: string | null
          headline_summary: string
          id: string
          raw_headlines: Json | null
          specialist_id: string
          tokens_in: number | null
          tokens_out: number | null
          watch_items: string
        }
        Insert: {
          briefing_type: string
          created_at?: string
          domain_impact: string
          estimated_cost_usd?: number | null
          foundry_id?: string | null
          headline_summary: string
          id?: string
          raw_headlines?: Json | null
          specialist_id: string
          tokens_in?: number | null
          tokens_out?: number | null
          watch_items: string
        }
        Update: {
          briefing_type?: string
          created_at?: string
          domain_impact?: string
          estimated_cost_usd?: number | null
          foundry_id?: string | null
          headline_summary?: string
          id?: string
          raw_headlines?: Json | null
          specialist_id?: string
          tokens_in?: number | null
          tokens_out?: number | null
          watch_items?: string
        }
        Relationships: [
          {
            foreignKeyName: "specialist_briefings_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
        ]
      }
      specialist_decision_journal: {
        Row: {
          context: string | null
          created_at: string
          decision: string
          foundry_id: string
          id: string
          outcome: string | null
          specialist_id: string
        }
        Insert: {
          context?: string | null
          created_at?: string
          decision: string
          foundry_id: string
          id?: string
          outcome?: string | null
          specialist_id: string
        }
        Update: {
          context?: string | null
          created_at?: string
          decision?: string
          foundry_id?: string
          id?: string
          outcome?: string | null
          specialist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "specialist_decision_journal_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "standups_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      step_templates: {
        Row: {
          category: string
          created_at: string | null
          description: string | null
          file_size_bytes: number | null
          foundry_id: string | null
          id: string
          is_assembly: boolean | null
          license: string
          metadata: Json | null
          name: string
          slug: string
          source_path: string
          source_repo: string
          step_url: string | null
          stl_url: string | null
          subcategory: string | null
          tags: string[] | null
          thumbnail_url: string | null
          updated_at: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          description?: string | null
          file_size_bytes?: number | null
          foundry_id?: string | null
          id?: string
          is_assembly?: boolean | null
          license: string
          metadata?: Json | null
          name: string
          slug: string
          source_path: string
          source_repo: string
          step_url?: string | null
          stl_url?: string | null
          subcategory?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string | null
          file_size_bytes?: number | null
          foundry_id?: string | null
          id?: string
          is_assembly?: boolean | null
          license?: string
          metadata?: Json | null
          name?: string
          slug?: string
          source_path?: string
          source_repo?: string
          step_url?: string | null
          stl_url?: string | null
          subcategory?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "step_templates_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_events: {
        Row: {
          created_at: string | null
          error: string | null
          event_type: string
          id: string
          payload: Json
          processed: boolean | null
          processed_at: string | null
          processing_started_at: string | null
          retry_count: number | null
          stripe_event_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          error?: string | null
          event_type: string
          id?: string
          payload: Json
          processed?: boolean | null
          processed_at?: string | null
          processing_started_at?: string | null
          retry_count?: number | null
          stripe_event_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          error?: string | null
          event_type?: string
          id?: string
          payload?: Json
          processed?: boolean | null
          processed_at?: string | null
          processing_started_at?: string | null
          retry_count?: number | null
          stripe_event_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      subsystem_objective_packs: {
        Row: {
          created_at: string
          difficulty: string | null
          estimated_duration: string | null
          extended_description: string | null
          id: string
          is_default: boolean | null
          subsystem_id: string
          summary: string | null
          tasks: Json
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          difficulty?: string | null
          estimated_duration?: string | null
          extended_description?: string | null
          id?: string
          is_default?: boolean | null
          subsystem_id: string
          summary?: string | null
          tasks?: Json
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          difficulty?: string | null
          estimated_duration?: string | null
          extended_description?: string | null
          id?: string
          is_default?: boolean | null
          subsystem_id?: string
          summary?: string | null
          tasks?: Json
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subsystem_objective_packs_subsystem_id_fkey"
            columns: ["subsystem_id"]
            isOneToOne: false
            referencedRelation: "universal_subsystems"
            referencedColumns: ["id"]
          },
        ]
      }
      success_checkins: {
        Row: {
          action_items: Json | null
          buyer_feedback: string | null
          buyer_rating: number | null
          checkin_type: string
          completed_at: string | null
          continuation_confirmed: boolean | null
          created_at: string | null
          id: string
          issues_raised: string | null
          order_id: string
          retainer_id: string | null
          scheduled_for: string
          scope_changes: string | null
          seller_feedback: string | null
          seller_rating: number | null
        }
        Insert: {
          action_items?: Json | null
          buyer_feedback?: string | null
          buyer_rating?: number | null
          checkin_type: string
          completed_at?: string | null
          continuation_confirmed?: boolean | null
          created_at?: string | null
          id?: string
          issues_raised?: string | null
          order_id: string
          retainer_id?: string | null
          scheduled_for: string
          scope_changes?: string | null
          seller_feedback?: string | null
          seller_rating?: number | null
        }
        Update: {
          action_items?: Json | null
          buyer_feedback?: string | null
          buyer_rating?: number | null
          checkin_type?: string
          completed_at?: string | null
          continuation_confirmed?: boolean | null
          created_at?: string | null
          id?: string
          issues_raised?: string | null
          order_id?: string
          retainer_id?: string | null
          scheduled_for?: string
          scope_changes?: string | null
          seller_feedback?: string | null
          seller_rating?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "success_checkins_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "success_checkins_retainer_id_fkey"
            columns: ["retainer_id"]
            isOneToOne: false
            referencedRelation: "retainers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_reviews: {
        Row: {
          cons: string[] | null
          content: string | null
          created_at: string | null
          foundry_id: string
          id: string
          order_value_range: string | null
          project_type: string | null
          pros: string[] | null
          rating: number
          reviewer_id: string
          supplier_id: string
          title: string | null
          verified_purchase: boolean | null
          would_recommend: boolean | null
        }
        Insert: {
          cons?: string[] | null
          content?: string | null
          created_at?: string | null
          foundry_id: string
          id?: string
          order_value_range?: string | null
          project_type?: string | null
          pros?: string[] | null
          rating: number
          reviewer_id: string
          supplier_id: string
          title?: string | null
          verified_purchase?: boolean | null
          would_recommend?: boolean | null
        }
        Update: {
          cons?: string[] | null
          content?: string | null
          created_at?: string | null
          foundry_id?: string
          id?: string
          order_value_range?: string | null
          project_type?: string | null
          pros?: string[] | null
          rating?: number
          reviewer_id?: string
          supplier_id?: string
          title?: string | null
          verified_purchase?: boolean | null
          would_recommend?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_reviews_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "supplier_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_reviews_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          capabilities: Json | null
          community_rating: number | null
          company_info: Json | null
          contact: Json | null
          created_at: string | null
          description: string | null
          domain_categories: string[] | null
          id: string
          logo_url: string | null
          metadata: Json | null
          name: string
          review_count: number | null
          supplier_type: string
          updated_at: string | null
          used_by_count: number | null
          verification_status: string | null
          verified_at: string | null
          verified_by: string | null
          website: string | null
        }
        Insert: {
          capabilities?: Json | null
          community_rating?: number | null
          company_info?: Json | null
          contact?: Json | null
          created_at?: string | null
          description?: string | null
          domain_categories?: string[] | null
          id?: string
          logo_url?: string | null
          metadata?: Json | null
          name: string
          review_count?: number | null
          supplier_type: string
          updated_at?: string | null
          used_by_count?: number | null
          verification_status?: string | null
          verified_at?: string | null
          verified_by?: string | null
          website?: string | null
        }
        Update: {
          capabilities?: Json | null
          community_rating?: number | null
          company_info?: Json | null
          contact?: Json | null
          created_at?: string | null
          description?: string | null
          domain_categories?: string[] | null
          id?: string
          logo_url?: string | null
          metadata?: Json | null
          name?: string
          review_count?: number | null
          supplier_type?: string
          updated_at?: string | null
          used_by_count?: number | null
          verification_status?: string | null
          verified_at?: string | null
          verified_by?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "suppliers_verified_by_fkey"
            columns: ["verified_by"]
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
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
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
      task_comment_reads: {
        Row: {
          comment_id: string
          foundry_id: string
          read_at: string | null
          user_id: string
        }
        Insert: {
          comment_id: string
          foundry_id: string
          read_at?: string | null
          user_id: string
        }
        Update: {
          comment_id?: string
          foundry_id?: string
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comment_reads_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "task_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comment_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "task_comment_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          message_id: string | null
          synced_from_message: boolean | null
          task_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          foundry_id: string
          id?: string
          is_system_log?: boolean | null
          message_id?: string | null
          synced_from_message?: boolean | null
          task_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          foundry_id?: string
          id?: string
          is_system_log?: boolean | null
          message_id?: string | null
          synced_from_message?: boolean | null
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
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
      task_dependencies: {
        Row: {
          created_at: string
          dependency_type: string
          depends_on_task_id: string
          foundry_id: string
          id: string
          task_id: string
        }
        Insert: {
          created_at?: string
          dependency_type?: string
          depends_on_task_id: string
          foundry_id: string
          id?: string
          task_id: string
        }
        Update: {
          created_at?: string
          dependency_type?: string
          depends_on_task_id?: string
          foundry_id?: string
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_dependencies_depends_on_task_id_fkey"
            columns: ["depends_on_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_dependencies_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
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
          google_drive_file_id: string | null
          google_drive_url: string | null
          id: string
          mime_type: string | null
          source: string
          task_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          google_drive_file_id?: string | null
          google_drive_url?: string | null
          id?: string
          mime_type?: string | null
          source?: string
          task_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          google_drive_file_id?: string | null
          google_drive_url?: string | null
          id?: string
          mime_type?: string | null
          source?: string
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
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
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
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
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
      task_shares: {
        Row: {
          created_at: string | null
          id: string
          shared_by: string
          shared_with_team_id: string | null
          shared_with_user_id: string | null
          task_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          shared_by: string
          shared_with_team_id?: string | null
          shared_with_user_id?: string | null
          task_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          shared_by?: string
          shared_with_team_id?: string | null
          shared_with_user_id?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_shares_shared_by_fkey"
            columns: ["shared_by"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "task_shares_shared_by_fkey"
            columns: ["shared_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_shares_shared_with_team_id_fkey"
            columns: ["shared_with_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_shares_shared_with_user_id_fkey"
            columns: ["shared_with_user_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "task_shares_shared_with_user_id_fkey"
            columns: ["shared_with_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_shares_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          agent_approved: boolean | null
          amendment_notes: string | null
          approval_escalated: boolean | null
          approval_requested_at: string | null
          assignee_id: string | null
          client_visible: boolean | null
          created_at: string | null
          created_by_agent_id: string | null
          creator_id: string
          deleted_at: string | null
          description: string | null
          end_date: string | null
          escalation_reason: string | null
          forwarding_history: Json | null
          foundry_id: string
          ghost_rationale: string | null
          ghost_source: string | null
          id: string
          is_demo: boolean
          is_ghost: boolean
          is_private: boolean
          last_nudge_at: string | null
          metadata: Json | null
          nudge_count: number | null
          objective_id: string
          owner_agent_id: string | null
          progress: number | null
          risk_level: Database["public"]["Enums"]["risk_level"]
          start_date: string | null
          status: Database["public"]["Enums"]["task_status"] | null
          task_number: number
          title: string
          updated_at: string | null
          workstream: string | null
        }
        Insert: {
          agent_approved?: boolean | null
          amendment_notes?: string | null
          approval_escalated?: boolean | null
          approval_requested_at?: string | null
          assignee_id?: string | null
          client_visible?: boolean | null
          created_at?: string | null
          created_by_agent_id?: string | null
          creator_id: string
          deleted_at?: string | null
          description?: string | null
          end_date?: string | null
          escalation_reason?: string | null
          forwarding_history?: Json | null
          foundry_id: string
          ghost_rationale?: string | null
          ghost_source?: string | null
          id?: string
          is_demo?: boolean
          is_ghost?: boolean
          is_private?: boolean
          last_nudge_at?: string | null
          metadata?: Json | null
          nudge_count?: number | null
          objective_id: string
          owner_agent_id?: string | null
          progress?: number | null
          risk_level?: Database["public"]["Enums"]["risk_level"]
          start_date?: string | null
          status?: Database["public"]["Enums"]["task_status"] | null
          task_number?: number
          title: string
          updated_at?: string | null
          workstream?: string | null
        }
        Update: {
          agent_approved?: boolean | null
          amendment_notes?: string | null
          approval_escalated?: boolean | null
          approval_requested_at?: string | null
          assignee_id?: string | null
          client_visible?: boolean | null
          created_at?: string | null
          created_by_agent_id?: string | null
          creator_id?: string
          deleted_at?: string | null
          description?: string | null
          end_date?: string | null
          escalation_reason?: string | null
          forwarding_history?: Json | null
          foundry_id?: string
          ghost_rationale?: string | null
          ghost_source?: string | null
          id?: string
          is_demo?: boolean
          is_ghost?: boolean
          is_private?: boolean
          last_nudge_at?: string | null
          metadata?: Json | null
          nudge_count?: number | null
          objective_id?: string
          owner_agent_id?: string | null
          progress?: number | null
          risk_level?: Database["public"]["Enums"]["risk_level"]
          start_date?: string | null
          status?: Database["public"]["Enums"]["task_status"] | null
          task_number?: number
          title?: string
          updated_at?: string | null
          workstream?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_agent_id_fkey"
            columns: ["created_by_agent_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "tasks_created_by_agent_id_fkey"
            columns: ["created_by_agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
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
          {
            foreignKeyName: "tasks_owner_agent_id_fkey"
            columns: ["owner_agent_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "tasks_owner_agent_id_fkey"
            columns: ["owner_agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_profiles: {
        Row: {
          country_code: string
          created_at: string | null
          id: string
          provider_id: string
          tax_exempt: boolean | null
          vat_number: string | null
          vat_verified: boolean | null
        }
        Insert: {
          country_code: string
          created_at?: string | null
          id?: string
          provider_id: string
          tax_exempt?: boolean | null
          vat_number?: string | null
          vat_verified?: boolean | null
        }
        Update: {
          country_code?: string
          created_at?: string | null
          id?: string
          provider_id?: string
          tax_exempt?: boolean | null
          vat_number?: string | null
          vat_verified?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "tax_profiles_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: true
            referencedRelation: "provider_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_profiles_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: true
            referencedRelation: "provider_stats"
            referencedColumns: ["provider_id"]
          },
          {
            foreignKeyName: "tax_profiles_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: true
            referencedRelation: "supplier_search_ranking"
            referencedColumns: ["provider_id"]
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
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
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
          description: string | null
          foundry_id: string
          id: string
          is_auto_generated: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          foundry_id: string
          id?: string
          is_auto_generated?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          foundry_id?: string
          id?: string
          is_auto_generated?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      telegram_decisions: {
        Row: {
          created_at: string | null
          decided_at: string | null
          decision_note: string | null
          decision_type: string
          description: string | null
          expires_at: string | null
          foundry_id: string
          id: string
          metadata: Json | null
          priority: string | null
          profile_id: string
          reference_id: string
          reference_type: string
          status: string | null
          telegram_chat_id: string | null
          telegram_message_id: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          decided_at?: string | null
          decision_note?: string | null
          decision_type: string
          description?: string | null
          expires_at?: string | null
          foundry_id: string
          id?: string
          metadata?: Json | null
          priority?: string | null
          profile_id: string
          reference_id: string
          reference_type: string
          status?: string | null
          telegram_chat_id?: string | null
          telegram_message_id?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          decided_at?: string | null
          decision_note?: string | null
          decision_type?: string
          description?: string | null
          expires_at?: string | null
          foundry_id?: string
          id?: string
          metadata?: Json | null
          priority?: string | null
          profile_id?: string
          reference_id?: string
          reference_type?: string
          status?: string | null
          telegram_chat_id?: string | null
          telegram_message_id?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "telegram_decisions_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_decisions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "telegram_decisions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_ideas: {
        Row: {
          content: string
          created_at: string | null
          foundry_id: string
          id: string
          original_audio_url: string | null
          profile_id: string
          promoted_to_objective_id: string | null
          status: string | null
          telegram_message_id: string | null
          transcribed_from_voice: boolean | null
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          foundry_id: string
          id?: string
          original_audio_url?: string | null
          profile_id: string
          promoted_to_objective_id?: string | null
          status?: string | null
          telegram_message_id?: string | null
          transcribed_from_voice?: boolean | null
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          foundry_id?: string
          id?: string
          original_audio_url?: string | null
          profile_id?: string
          promoted_to_objective_id?: string | null
          status?: string | null
          telegram_message_id?: string | null
          transcribed_from_voice?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "telegram_ideas_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_ideas_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "telegram_ideas_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_ideas_promoted_to_objective_id_fkey"
            columns: ["promoted_to_objective_id"]
            isOneToOne: false
            referencedRelation: "objectives"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_notification_log: {
        Row: {
          delivered: boolean | null
          error_message: string | null
          id: string
          notification_id: string | null
          notification_type: string
          profile_id: string
          sent_at: string | null
          telegram_chat_id: string
          telegram_message_id: string | null
        }
        Insert: {
          delivered?: boolean | null
          error_message?: string | null
          id?: string
          notification_id?: string | null
          notification_type: string
          profile_id: string
          sent_at?: string | null
          telegram_chat_id: string
          telegram_message_id?: string | null
        }
        Update: {
          delivered?: boolean | null
          error_message?: string | null
          id?: string
          notification_id?: string | null
          notification_type?: string
          profile_id?: string
          sent_at?: string | null
          telegram_chat_id?: string
          telegram_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "telegram_notification_log_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_notification_log_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "telegram_notification_log_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_outreach_log: {
        Row: {
          created_at: string
          id: string
          outreach_type: string
          specialist_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          outreach_type: string
          specialist_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          outreach_type?: string
          specialist_id?: string
          user_id?: string
        }
        Relationships: []
      }
      telegram_preferences: {
        Row: {
          created_at: string | null
          daily_briefing_enabled: boolean | null
          daily_briefing_time: string | null
          id: string
          messaging_link_id: string | null
          muted_until: string | null
          notifications_enabled: boolean | null
          notify_approvals: boolean | null
          notify_mentions: boolean | null
          notify_orders: boolean | null
          notify_rfq: boolean | null
          notify_task_assigned: boolean | null
          notify_task_completed: boolean | null
          profile_id: string
          timezone: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          daily_briefing_enabled?: boolean | null
          daily_briefing_time?: string | null
          id?: string
          messaging_link_id?: string | null
          muted_until?: string | null
          notifications_enabled?: boolean | null
          notify_approvals?: boolean | null
          notify_mentions?: boolean | null
          notify_orders?: boolean | null
          notify_rfq?: boolean | null
          notify_task_assigned?: boolean | null
          notify_task_completed?: boolean | null
          profile_id: string
          timezone?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          daily_briefing_enabled?: boolean | null
          daily_briefing_time?: string | null
          id?: string
          messaging_link_id?: string | null
          muted_until?: string | null
          notifications_enabled?: boolean | null
          notify_approvals?: boolean | null
          notify_mentions?: boolean | null
          notify_orders?: boolean | null
          notify_rfq?: boolean | null
          notify_task_assigned?: boolean | null
          notify_task_completed?: boolean | null
          profile_id?: string
          timezone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "telegram_preferences_messaging_link_id_fkey"
            columns: ["messaging_link_id"]
            isOneToOne: false
            referencedRelation: "messaging_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_preferences_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "telegram_preferences_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_specialist_sessions: {
        Row: {
          chat_id: string
          foundry_id: string
          specialist_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          chat_id: string
          foundry_id: string
          specialist_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          chat_id?: string
          foundry_id?: string
          specialist_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_specialist_sessions_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
        ]
      }
      timesheet_entries: {
        Row: {
          approved_at: string | null
          description: string | null
          hours_logged: number
          id: string
          paid_at: string | null
          retainer_id: string
          status: string | null
          stripe_payment_intent_id: string | null
          submitted_at: string | null
          week_start: string
        }
        Insert: {
          approved_at?: string | null
          description?: string | null
          hours_logged: number
          id?: string
          paid_at?: string | null
          retainer_id: string
          status?: string | null
          stripe_payment_intent_id?: string | null
          submitted_at?: string | null
          week_start: string
        }
        Update: {
          approved_at?: string | null
          description?: string | null
          hours_logged?: number
          id?: string
          paid_at?: string | null
          retainer_id?: string
          status?: string | null
          stripe_payment_intent_id?: string | null
          submitted_at?: string | null
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "timesheet_entries_retainer_id_fkey"
            columns: ["retainer_id"]
            isOneToOne: false
            referencedRelation: "retainers"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_limits: {
        Row: {
          created_at: string | null
          current_amount: number | null
          id: string
          limit_amount: number
          limit_type: string
          reset_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          current_amount?: number | null
          id?: string
          limit_amount: number
          limit_type: string
          reset_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          current_amount?: number | null
          id?: string
          limit_amount?: number
          limit_type?: string
          reset_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_limits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "transaction_limits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tutorials: {
        Row: {
          common_mistakes: string[] | null
          created_at: string
          description: string | null
          difficulty: string | null
          embedding: string | null
          estimated_read_minutes: number | null
          further_reading: string[] | null
          id: string
          key_takeaways: string[] | null
          prerequisites: string[] | null
          sections: Json
          slug: string
          tags: string[] | null
          title: string
          tools_mentioned: string[] | null
          topic: string | null
        }
        Insert: {
          common_mistakes?: string[] | null
          created_at?: string
          description?: string | null
          difficulty?: string | null
          embedding?: string | null
          estimated_read_minutes?: number | null
          further_reading?: string[] | null
          id?: string
          key_takeaways?: string[] | null
          prerequisites?: string[] | null
          sections?: Json
          slug: string
          tags?: string[] | null
          title: string
          tools_mentioned?: string[] | null
          topic?: string | null
        }
        Update: {
          common_mistakes?: string[] | null
          created_at?: string
          description?: string | null
          difficulty?: string | null
          embedding?: string | null
          estimated_read_minutes?: number | null
          further_reading?: string[] | null
          id?: string
          key_takeaways?: string[] | null
          prerequisites?: string[] | null
          sections?: Json
          slug?: string
          tags?: string[] | null
          title?: string
          tools_mentioned?: string[] | null
          topic?: string | null
        }
        Relationships: []
      }
      universal_subsystems: {
        Row: {
          category: string
          created_at: string
          description: string | null
          display_order: number | null
          icon_name: string | null
          id: string
          is_active: boolean | null
          key_questions: Json | null
          learning_resources: Json | null
          marketplace_categories: string[] | null
          name: string
          primer: Json | null
          recommended_executive_roles: string[] | null
          recommended_supplier_types: string[] | null
          slug: string
          tagline: string | null
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          display_order?: number | null
          icon_name?: string | null
          id?: string
          is_active?: boolean | null
          key_questions?: Json | null
          learning_resources?: Json | null
          marketplace_categories?: string[] | null
          name: string
          primer?: Json | null
          recommended_executive_roles?: string[] | null
          recommended_supplier_types?: string[] | null
          slug: string
          tagline?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          display_order?: number | null
          icon_name?: string | null
          id?: string
          is_active?: boolean | null
          key_questions?: Json | null
          learning_resources?: Json | null
          marketplace_categories?: string[] | null
          name?: string
          primer?: Json | null
          recommended_executive_roles?: string[] | null
          recommended_supplier_types?: string[] | null
          slug?: string
          tagline?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_intelligence_profiles: {
        Row: {
          communication_style: Json | null
          created_at: string
          days_of_data: number | null
          first_activity_at: string | null
          focus_areas: Json | null
          foundry_id: string
          id: string
          known_blockers: Json | null
          productivity_patterns: Json | null
          recent_wins: Json | null
          risk_tolerance: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          communication_style?: Json | null
          created_at?: string
          days_of_data?: number | null
          first_activity_at?: string | null
          focus_areas?: Json | null
          foundry_id: string
          id?: string
          known_blockers?: Json | null
          productivity_patterns?: Json | null
          recent_wins?: Json | null
          risk_tolerance?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          communication_style?: Json | null
          created_at?: string
          days_of_data?: number | null
          first_activity_at?: string | null
          focus_areas?: Json | null
          foundry_id?: string
          id?: string
          known_blockers?: Json | null
          productivity_patterns?: Json | null
          recent_wins?: Json | null
          risk_tolerance?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_intelligence_profiles_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          created_at: string
          foundry_id: string
          id: string
          inbox_task_filter: string
          inbox_view: string
          profile_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          foundry_id: string
          id?: string
          inbox_task_filter?: string
          inbox_view?: string
          profile_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          foundry_id?: string
          id?: string
          inbox_task_filter?: string
          inbox_view?: string
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "user_preferences_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_reminders: {
        Row: {
          completed_at: string | null
          conversation_id: string | null
          created_at: string | null
          foundry_id: string
          id: string
          message: string
          message_id: string | null
          remind_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string | null
          foundry_id: string
          id?: string
          message: string
          message_id?: string | null
          remind_at: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string | null
          foundry_id?: string
          id?: string
          message?: string
          message_id?: string | null
          remind_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_reminders_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reminders_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reminders_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reminders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "user_reminders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string | null
          current_period_end: string
          current_period_start: string
          id: string
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          tier: string
          trial_end: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end: string
          current_period_start: string
          id?: string
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          tier: string
          trial_end?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string
          current_period_start?: string
          id?: string
          status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string
          tier?: string
          trial_end?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "buyer_stats"
            referencedColumns: ["buyer_id"]
          },
          {
            foreignKeyName: "user_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          email: string
          id: string
          invite_token: string | null
          redeemed_at: string | null
          status: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          email: string
          id?: string
          invite_token?: string | null
          redeemed_at?: string | null
          status?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          email?: string
          id?: string
          invite_token?: string | null
          redeemed_at?: string | null
          status?: string
        }
        Relationships: []
      }
      whiteboards: {
        Row: {
          created_at: string
          created_by: string
          foundry_id: string
          id: string
          linked_entity_id: string | null
          linked_entity_type: string | null
          state: Json
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          foundry_id: string
          id?: string
          linked_entity_id?: string | null
          linked_entity_type?: string | null
          state?: Json
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          foundry_id?: string
          id?: string
          linked_entity_id?: string | null
          linked_entity_type?: string | null
          state?: Json
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whiteboards_foundry_id_fkey"
            columns: ["foundry_id"]
            isOneToOne: false
            referencedRelation: "foundries"
            referencedColumns: ["id"]
          },
        ]
      }
      work_edges: {
        Row: {
          created_at: string
          deleted_at: string | null
          dep_type: string
          foundry_id: string
          from_item_id: string
          from_item_type: string
          id: string
          to_item_id: string
          to_item_type: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          dep_type?: string
          foundry_id: string
          from_item_id: string
          from_item_type: string
          id?: string
          to_item_id: string
          to_item_type: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          dep_type?: string
          foundry_id?: string
          from_item_id?: string
          from_item_type?: string
          id?: string
          to_item_id?: string
          to_item_type?: string
        }
        Relationships: []
      }
      xray_scans: {
        Row: {
          created_at: string
          created_by: string
          enrichments: Json | null
          foundry_id: string
          id: string
          idea: string
          module_count: number | null
          name: string | null
          people_matches: Json | null
          research_report: Json | null
          scan_status: string
          spec: Json
          stage: string
          status: string
          supplier_matches: Json | null
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          enrichments?: Json | null
          foundry_id: string
          id?: string
          idea: string
          module_count?: number | null
          name?: string | null
          people_matches?: Json | null
          research_report?: Json | null
          scan_status?: string
          spec?: Json
          stage?: string
          status?: string
          supplier_matches?: Json | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          enrichments?: Json | null
          foundry_id?: string
          id?: string
          idea?: string
          module_count?: number | null
          name?: string | null
          people_matches?: Json | null
          research_report?: Json | null
          scan_status?: string
          spec?: Json
          stage?: string
          status?: string
          supplier_matches?: Json | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      ai_spending_monthly: {
        Row: {
          foundry_id: string | null
          month: string | null
          total_cost_gbp: number | null
          total_cost_pence: number | null
          total_requests: number | null
          total_tokens: number | null
        }
        Relationships: []
      }
      ai_usage_daily_summary: {
        Row: {
          avg_duration_ms: number | null
          failed_requests: number | null
          foundry_id: string | null
          model: string | null
          operation_type: string | null
          request_count: number | null
          successful_requests: number | null
          total_completion_tokens: number | null
          total_cost_pence: number | null
          total_prompt_tokens: number | null
          total_tokens: number | null
          usage_date: string | null
        }
        Relationships: []
      }
      buyer_stats: {
        Row: {
          average_order_value: number | null
          buyer_id: string | null
          completed_orders: number | null
          last_order_at: string | null
          total_orders: number | null
          total_savings: number | null
          total_spend: number | null
          unique_providers: number | null
          updated_at: string | null
        }
        Relationships: []
      }
      category_stats: {
        Row: {
          average_rating: number | null
          buyer_count: number | null
          category: Database["public"]["Enums"]["marketplace_category"] | null
          provider_count: number | null
          total_gmv: number | null
          total_orders: number | null
          updated_at: string | null
        }
        Relationships: []
      }
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
      platform_daily_stats: {
        Row: {
          active_buyers: number | null
          active_providers: number | null
          average_order_value: number | null
          completed_orders: number | null
          completion_rate: number | null
          dispute_rate: number | null
          disputed_orders: number | null
          new_users: number | null
          stat_date: string | null
          total_buyers: number | null
          total_fees: number | null
          total_gmv: number | null
          total_orders: number | null
          total_providers: number | null
          total_users: number | null
          updated_at: string | null
        }
        Relationships: []
      }
      platform_monthly_stats: {
        Row: {
          avg_order_value: number | null
          completed_orders: number | null
          month: string | null
          new_users: number | null
          total_buyers: number | null
          total_fees: number | null
          total_gmv: number | null
          total_orders: number | null
          total_providers: number | null
          total_users: number | null
        }
        Relationships: []
      }
      provider_stats: {
        Row: {
          average_order_value: number | null
          average_rating: number | null
          avg_response_time_hours: number | null
          cancelled_orders: number | null
          completed_orders: number | null
          completion_rate: number | null
          last_order_at: string | null
          lifetime_gmv: number | null
          provider_id: string | null
          repeat_client_rate: number | null
          response_rate: number | null
          total_orders: number | null
          total_reviews: number | null
          updated_at: string | null
        }
        Relationships: []
      }
      supplier_search_ranking: {
        Row: {
          attributes: Json | null
          avg_rating: number | null
          avg_response_time_hours: number | null
          category: Database["public"]["Enums"]["marketplace_category"] | null
          centaur_discount_percent: number | null
          completion_rate: number | null
          currency: string | null
          day_rate: number | null
          description: string | null
          image_url: string | null
          is_active: boolean | null
          is_verified: boolean | null
          listing_created_at: string | null
          listing_id: string | null
          provider_created_at: string | null
          provider_id: string | null
          response_rate: number | null
          search_vector: unknown
          subcategory: string | null
          tier: Database["public"]["Enums"]["supplier_tier"] | null
          tier_score: number | null
          title: string | null
          total_orders: number | null
          total_reviews: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      accept_advisory_answer: {
        Args: { p_answer_id: string }
        Returns: {
          author_id: string | null
          author_type: string
          body: string
          created_at: string
          id: string
          is_accepted: boolean
          marketplace_suggestions: Json | null
          question_id: string
          updated_at: string
          upvotes: number
          verification_status: string
          verified_at: string | null
          verified_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "advisory_answers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      acquire_memory_processing_lock: {
        Args: { p_thread_id: string }
        Returns: boolean
      }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      adjust_account_balance: {
        Args: {
          p_amount: number
          p_description?: string
          p_reference_id?: string
          p_reference_type?: string
          p_stripe_payment_intent_id?: string
          p_transaction_type: string
          p_user_id: string
        }
        Returns: {
          error_message: string
          new_balance: number
          success: boolean
        }[]
      }
      calculate_ai_cost: {
        Args: {
          completion_tokens: number
          model_name: string
          prompt_tokens: number
        }
        Returns: number
      }
      calculate_blueprint_coverage: {
        Args: { p_blueprint_id: string }
        Returns: {
          coverage_score: number
          covered_domains: number
          critical_gaps: number
          total_domains: number
        }[]
      }
      calculate_otjt_progress: {
        Args: { enrollment_id: string }
        Returns: number
      }
      calculate_profile_completeness: {
        Args: { provider_id_input: string }
        Returns: number
      }
      calculate_workload_score: { Args: { p_user_id: string }; Returns: number }
      can_user_approve: {
        Args: { p_task_id: string; p_user_id: string }
        Returns: boolean
      }
      check_agent_permission: {
        Args: {
          p_action_type: string
          p_agent_id?: string
          p_foundry_id: string
        }
        Returns: Json
      }
      check_ai_spending_cap: { Args: { p_foundry_id: string }; Returns: Json }
      check_rate_limit: {
        Args: {
          p_key: string
          p_limit: number
          p_now: string
          p_window_start: string
        }
        Returns: Json
      }
      cleanup_expired_intents: { Args: never; Returns: number }
      cleanup_expired_telegram_sessions: { Args: never; Returns: undefined }
      cleanup_old_activity_events: { Args: never; Returns: number }
      cleanup_old_intelligence_reports: { Args: never; Returns: undefined }
      cleanup_old_outreach_logs: { Args: never; Returns: undefined }
      clone_blueprint_from_template: {
        Args: {
          p_created_by?: string
          p_description?: string
          p_foundry_id: string
          p_name: string
          p_template_id: string
        }
        Returns: string
      }
      component_bom_from_root: {
        Args: { max_depth?: number; root_component: string }
        Returns: {
          component_id: string
          depth: number
          path: string[]
          relationship: string
        }[]
      }
      component_compatibility_multi_hop: {
        Args: { max_depth?: number; start_component: string }
        Returns: {
          depth: number
          node: string
          notes: string
          related: string
          relationship: string
        }[]
      }
      count_active_founders: {
        Args: { target_foundry_id: string }
        Returns: number
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
      create_notification_safe: {
        Args: {
          p_action_url?: string
          p_body: string
          p_metadata?: Json
          p_priority?: string
          p_title: string
          p_user_id: string
        }
        Returns: string
      }
      create_telegram_decision: {
        Args: {
          p_decision_type: string
          p_description: string
          p_metadata?: Json
          p_priority?: string
          p_profile_id: string
          p_reference_id: string
          p_reference_type: string
          p_title: string
        }
        Returns: string
      }
      create_user_foundry: {
        Args: {
          p_company_name: string
          p_industry?: string
          p_stage?: string
          p_user_id: string
        }
        Returns: Json
      }
      debug_check_foundry: { Args: { p_foundry_id: string }; Returns: Json }
      debug_profiles_policies: { Args: never; Returns: Json }
      diagnose_foundry_rls: { Args: never; Returns: Json }
      disablelongtransactions: { Args: never; Returns: string }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      enablelongtransactions: { Args: never; Returns: string }
      ensure_foundry_exists: { Args: { p_foundry_id: string }; Returns: Json }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      escalate_task: {
        Args: { p_reason?: string; p_task_id: string }
        Returns: {
          agent_approved: boolean | null
          amendment_notes: string | null
          approval_escalated: boolean | null
          approval_requested_at: string | null
          assignee_id: string | null
          client_visible: boolean | null
          created_at: string | null
          created_by_agent_id: string | null
          creator_id: string
          deleted_at: string | null
          description: string | null
          end_date: string | null
          escalation_reason: string | null
          forwarding_history: Json | null
          foundry_id: string
          ghost_rationale: string | null
          ghost_source: string | null
          id: string
          is_demo: boolean
          is_ghost: boolean
          is_private: boolean
          last_nudge_at: string | null
          metadata: Json | null
          nudge_count: number | null
          objective_id: string
          owner_agent_id: string | null
          progress: number | null
          risk_level: Database["public"]["Enums"]["risk_level"]
          start_date: string | null
          status: Database["public"]["Enums"]["task_status"] | null
          task_number: number
          title: string
          updated_at: string | null
          workstream: string | null
        }
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      extract_mentioned_user_ids: {
        Args: { foundry_id_param: string; message_text: string }
        Returns: string[]
      }
      generate_gap_recommendations: {
        Args: { p_foundry_id: string }
        Returns: number
      }
      generate_profile_slug: {
        Args: { full_name: string; user_id: string }
        Returns: string
      }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      get_active_collaborations: {
        Args: { p_foundry_id: string }
        Returns: {
          created_at: string
          id: string
          initiated_by_agent_name: string
          participant_count: number
          status: string
          title: string
        }[]
      }
      get_active_foundry_id: { Args: { p_user_id: string }; Returns: string }
      get_agent_unread_count: { Args: { p_agent_id: string }; Returns: number }
      get_ai_usage_current_month: {
        Args: { p_foundry_id: string }
        Returns: {
          total_ai_tasks: number
          total_cost_usd: number
          total_tokens: number
        }[]
      }
      get_blueprint_tasks: {
        Args: { p_blueprint_id: string }
        Returns: {
          agent_approved: boolean | null
          amendment_notes: string | null
          approval_escalated: boolean | null
          approval_requested_at: string | null
          assignee_id: string | null
          client_visible: boolean | null
          created_at: string | null
          created_by_agent_id: string | null
          creator_id: string
          deleted_at: string | null
          description: string | null
          end_date: string | null
          escalation_reason: string | null
          forwarding_history: Json | null
          foundry_id: string
          ghost_rationale: string | null
          ghost_source: string | null
          id: string
          is_demo: boolean
          is_ghost: boolean
          is_private: boolean
          last_nudge_at: string | null
          metadata: Json | null
          nudge_count: number | null
          objective_id: string
          owner_agent_id: string | null
          progress: number | null
          risk_level: Database["public"]["Enums"]["risk_level"]
          start_date: string | null
          status: Database["public"]["Enums"]["task_status"] | null
          task_number: number
          title: string
          updated_at: string | null
          workstream: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_buyer_spend: {
        Args: { p_buyer_id: string; p_end_date: string; p_start_date: string }
        Returns: {
          date: string
          order_count: number
          spend: number
        }[]
      }
      get_completion_trend: {
        Args: { p_days?: number; p_foundry_id: string }
        Returns: {
          completed: number
          created: number
          date: string
        }[]
      }
      get_daily_briefing: { Args: { p_profile_id: string }; Returns: Json }
      get_daily_pulse: {
        Args: { p_date?: string; p_profile_id: string }
        Returns: Json
      }
      get_directory_expert_by_slug: {
        Args: { p_slug: string }
        Returns: {
          accepts_trial: boolean
          average_rating: number
          bio: string
          company_stages: string[]
          currency: string
          day_rate: number
          featured_until: string
          headline: string
          hourly_rate: number
          id: string
          industries: string[]
          is_verified: boolean
          linkedin_url: string
          location: string
          minimum_engagement_hours: number
          profile_completeness: number
          profile_slug: string
          specializations: string[]
          tier: string
          timezone: string
          total_reviews: number
          total_transactions: number
          trial_rate_discount: number
          user_avatar: string
          user_name: string
          username: string
          video_thumbnail_url: string
          video_url: string
          website_url: string
          years_experience: number
        }[]
      }
      get_directory_expert_case_studies: {
        Args: { p_provider_id: string }
        Returns: {
          approach: string
          challenge: string
          client_industry: string
          client_name: string
          company_stage: string
          engagement_type: string
          hours_per_week: number
          id: string
          is_featured: boolean
          metrics: Json
          outcome: string
          testimonial_author: string
          testimonial_quote: string
          testimonial_role: string
          title: string
        }[]
      }
      get_directory_expert_count: {
        Args: { p_location?: string; p_role?: string; p_search?: string }
        Returns: number
      }
      get_directory_experts: {
        Args: {
          p_limit?: number
          p_location?: string
          p_offset?: number
          p_role?: string
          p_search?: string
        }
        Returns: {
          average_rating: number
          bio: string
          company_stages: string[]
          currency: string
          day_rate: number
          featured_until: string
          headline: string
          hourly_rate: number
          id: string
          industries: string[]
          is_verified: boolean
          location: string
          profile_completeness: number
          profile_slug: string
          specializations: string[]
          tier: string
          total_reviews: number
          total_transactions: number
          user_avatar: string
          user_name: string
          username: string
          years_experience: number
        }[]
      }
      get_directory_locations: {
        Args: never
        Returns: {
          expert_count: number
          location_name: string
        }[]
      }
      get_directory_roles: {
        Args: never
        Returns: {
          expert_count: number
          role_name: string
        }[]
      }
      get_domain_tasks: {
        Args: { p_domain_id: string }
        Returns: {
          agent_approved: boolean | null
          amendment_notes: string | null
          approval_escalated: boolean | null
          approval_requested_at: string | null
          assignee_id: string | null
          client_visible: boolean | null
          created_at: string | null
          created_by_agent_id: string | null
          creator_id: string
          deleted_at: string | null
          description: string | null
          end_date: string | null
          escalation_reason: string | null
          forwarding_history: Json | null
          foundry_id: string
          ghost_rationale: string | null
          ghost_source: string | null
          id: string
          is_demo: boolean
          is_ghost: boolean
          is_private: boolean
          last_nudge_at: string | null
          metadata: Json | null
          nudge_count: number | null
          objective_id: string
          owner_agent_id: string | null
          progress: number | null
          risk_level: Database["public"]["Enums"]["risk_level"]
          start_date: string | null
          status: Database["public"]["Enums"]["task_status"] | null
          task_number: number
          title: string
          updated_at: string | null
          workstream: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_escrow_balance_atomic: {
        Args: { p_order_id: string }
        Returns: {
          available_balance: number
          total_held: number
          total_released: number
        }[]
      }
      get_invitation_by_token: {
        Args: { invitation_token: string }
        Returns: {
          email: string
          expires_at: string
          foundry_id: string
          foundry_name: string
          id: string
          invited_by_name: string
          is_valid: boolean
          role: Database["public"]["Enums"]["member_role"]
        }[]
      }
      get_marketplace_recommendations: {
        Args: { p_foundry_id: string; p_limit?: number }
        Returns: {
          category: string
          created_at: string
          id: string
          priority: number
          reasoning: string
          search_term: string
          source_type: string
          subcategory: string
        }[]
      }
      get_monthly_summary: {
        Args: { p_foundry_id: string; p_month?: string }
        Returns: Json
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
      get_offboarding_tasks: {
        Args: { target_user_id: string }
        Returns: {
          current_assignee_name: string
          relationship_type: string
          task_id: string
          task_status: string
          task_title: string
        }[]
      }
      get_or_create_specialist_thread: {
        Args: {
          p_context_id: string
          p_context_type: string
          p_foundry_id: string
          p_metadata?: Json
          p_user_id: string
        }
        Returns: string
      }
      get_own_profile: { Args: never; Returns: Json }
      get_pending_decisions_count: {
        Args: { p_profile_id: string }
        Returns: number
      }
      get_pending_delegations: {
        Args: { p_agent_id: string }
        Returns: {
          created_at: string
          description: string
          id: string
          request_type: string
          requesting_agent_name: string
          title: string
        }[]
      }
      get_platform_fee_percent: {
        Args: { p_order_type?: string; p_role?: string }
        Returns: number
      }
      get_profile_by_id: { Args: { target_id: string }; Returns: Json }
      get_profiles_by_foundry: {
        Args: { target_foundry_id: string }
        Returns: Json
      }
      get_provider_earnings: {
        Args: {
          p_end_date: string
          p_provider_id: string
          p_start_date: string
        }
        Returns: {
          date: string
          earnings: number
          order_count: number
        }[]
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
      get_unread_message_count: { Args: { user_id: string }; Returns: number }
      get_user_foundries: {
        Args: { p_user_id: string }
        Returns: {
          foundry_id: string
          foundry_name: string
          is_active: boolean
          is_primary: boolean
          joined_at: string
          logo_url: string
          member_count: number
          role: Database["public"]["Enums"]["member_role"]
        }[]
      }
      get_user_foundry_id: { Args: never; Returns: string }
      get_user_foundry_ids: { Args: { p_user_id: string }; Returns: string[] }
      get_weekly_otjt_target: {
        Args: { enrollment_id: string }
        Returns: number
      }
      get_weekly_rollup: {
        Args: { p_foundry_id: string; p_week_start?: string }
        Returns: Json
      }
      gettransactionid: { Args: never; Returns: unknown }
      has_foundry_admin_access: {
        Args: { target_foundry_id: string; user_id: string }
        Returns: boolean
      }
      increment_ai_usage: {
        Args: {
          p_completion_tokens?: number
          p_estimated_cost_usd?: number
          p_feature: string
          p_foundry_id: string
          p_metadata?: Json
          p_model?: string
          p_prompt_tokens?: number
          p_user_id: string
        }
        Returns: {
          monthly_cost: number
          monthly_task_count: number
        }[]
      }
      increment_profile_views: {
        Args: { provider_id_input: string }
        Returns: undefined
      }
      increment_question_views: {
        Args: { p_question_id: string }
        Returns: undefined
      }
      increment_search_count: {
        Args: { search_query: string }
        Returns: undefined
      }
      insert_agent_insight: {
        Args: {
          p_body: string
          p_domain_data?: Json
          p_expires_at?: string
          p_foundry_id: string
          p_insight_type: string
          p_specialist_id: string
          p_suggested_actions?: Json
          p_title: string
          p_urgency: string
        }
        Returns: string
      }
      insert_security_audit_log: {
        Args: {
          p_action?: string
          p_details?: Json
          p_email?: string
          p_event_type: string
          p_ip_address?: string
          p_resource?: string
          p_severity?: string
          p_success?: boolean
          p_user_agent?: string
          p_user_id?: string
        }
        Returns: string
      }
      is_active_user: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_conversation_participant: {
        Args: { conv_id: string }
        Returns: boolean
      }
      is_foundry_admin: {
        Args: { p_foundry_id: string; p_user_id: string }
        Returns: boolean
      }
      is_otjt_on_track: { Args: { enrollment_id: string }; Returns: boolean }
      log_agent_action: {
        Args: {
          p_action_description: string
          p_action_type: string
          p_agent_id: string
          p_agent_name: string
          p_details?: Json
          p_foundry_id: string
          p_requires_approval_from?: string
          p_status?: string
        }
        Returns: string
      }
      log_agent_sweep: {
        Args: {
          p_duration_ms?: number
          p_error_message?: string
          p_estimated_cost_usd?: number
          p_foundry_id: string
          p_insights_generated?: number
          p_specialist_id: string
          p_status?: string
          p_tokens_in?: number
          p_tokens_out?: number
        }
        Returns: string
      }
      longtransactionsenabled: { Args: never; Returns: boolean }
      mark_conversation_read: {
        Args: { conv_id: string; user_id: string }
        Returns: undefined
      }
      match_component_compatibility: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          component_a: string
          component_b: string
          confidence: number
          domain: string
          id: string
          notes: string
          relationship: string
          similarity: number
        }[]
      }
      match_components: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          geometry_type_slug: string
          id: string
          manufacturer: string
          name: string
          part_number: string
          similarity: number
          tags: string[]
        }[]
      }
      match_marketplace_listings: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          category: string
          description: string
          id: string
          similarity: number
          subcategory: string
          title: string
        }[]
      }
      match_project_templates: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          category: string
          description: string
          difficulty: string
          id: string
          similarity: number
          slug: string
          title: string
        }[]
      }
      match_tutorials: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          description: string
          difficulty: string
          id: string
          similarity: number
          slug: string
          title: string
          topic: string
        }[]
      }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
      record_ai_usage: {
        Args: {
          p_completion_tokens: number
          p_error_message?: string
          p_foundry_id: string
          p_model: string
          p_operation_type: string
          p_prompt_tokens: number
          p_request_duration_ms?: number
          p_success?: boolean
          p_task_id: string
          p_total_tokens: number
          p_user_id: string
        }
        Returns: string
      }
      refresh_all_analytics: { Args: never; Returns: undefined }
      refresh_buyer_stats: { Args: never; Returns: undefined }
      refresh_platform_stats: { Args: never; Returns: undefined }
      refresh_provider_stats: { Args: never; Returns: undefined }
      refresh_search_ranking: { Args: never; Returns: undefined }
      repair_user_profile: { Args: never; Returns: Json }
      schedule_payment_retry: {
        Args: { p_failed_payment_id: string }
        Returns: string
      }
      search_forge_map_factories: {
        Args: {
          p_certification?: string
          p_lat?: number
          p_limit?: number
          p_lng?: number
          p_material?: string
          p_max_distance_km?: number
          p_process_type?: string
        }
        Returns: {
          capabilities: Json
          certifications: string[]
          distance_km: number
          factory_id: string
          factory_name: string
          factory_website: string
          postcode: string
          summary: string
          trust_score: number
        }[]
      }
      seed_demo_forge_concept: {
        Args: { p_foundry_id: string; p_user_id: string }
        Returns: string
      }
      seed_founder_demo_data: {
        Args: { p_foundry_id: string; p_user_id: string }
        Returns: undefined
      }
      seed_founder_demo_data_expanded: {
        Args: { p_foundry_id: string; p_user_id: string }
        Returns: undefined
      }
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
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
      switch_active_foundry: {
        Args: { p_foundry_id: string; p_user_id: string }
        Returns: boolean
      }
      unlockrows: { Args: { "": string }; Returns: number }
      update_blueprint_metrics: {
        Args: { p_blueprint_id: string }
        Returns: undefined
      }
      update_cad_lab_module: {
        Args: { p_module_data: Json; p_module_id: string; p_project_id: string }
        Returns: undefined
      }
      update_company_profile: {
        Args: { p_company_profile: Json; p_foundry_id: string }
        Returns: Json
      }
      update_foundry_purpose: {
        Args: { p_foundry_id: string; p_purpose_data: Json }
        Returns: Json
      }
      update_foundry_sector: {
        Args: { p_foundry_id: string; p_sector: string }
        Returns: undefined
      }
      update_own_profile: { Args: { data: Json }; Returns: Json }
      update_trending_searches: { Args: never; Returns: undefined }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
      }
      upsert_domain_familiarity: {
        Args: {
          p_domain_id: string
          p_familiarity: string
          p_foundry_id: string
          p_notes?: string
        }
        Returns: {
          domain_id: string
          familiarity: string
          foundry_id: string
          id: string
          notes: string | null
          updated_at: string | null
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "domain_familiarity"
          isOneToOne: true
          isSetofReturn: false
        }
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
      verify_advisory_answer: {
        Args: { p_answer_id: string; p_status?: string }
        Returns: {
          author_id: string | null
          author_type: string
          body: string
          created_at: string
          id: string
          is_accepted: boolean
          marketplace_suggestions: Json | null
          question_id: string
          updated_at: string
          upvotes: number
          verification_status: string
          verified_at: string | null
          verified_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "advisory_answers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      account_type: "team_builder" | "supplier"
      admin_role:
        | "super_admin"
        | "operations"
        | "support"
        | "finance"
        | "readonly"
      conversation_type:
        | "direct"
        | "task"
        | "objective"
        | "expert"
        | "marketplace"
      data_request_status: "pending" | "processing" | "completed" | "denied"
      data_request_type: "access" | "deletion" | "export"
      dispute_status:
        | "open"
        | "under_review"
        | "mediation"
        | "arbitration"
        | "resolved"
        | "escalated"
      escrow_status:
        | "pending"
        | "held"
        | "partial_release"
        | "released"
        | "refunded"
      feedback_category: "bug" | "idea" | "confusion" | "praise"
      funding_stage:
        | "Pre-Seed"
        | "Seed"
        | "Series A"
        | "Series B+"
        | "Growth"
        | "Bridge"
      legal_structure: "Ltd" | "Inc" | "LLC" | "GmbH" | "PLC" | "Other"
      marketplace_category: "People" | "Products" | "Services" | "AI"
      member_role: "Executive" | "Apprentice" | "AI_Agent" | "Founder"
      notification_channel: "push" | "email" | "sms" | "in_app"
      notification_priority: "critical" | "high" | "medium" | "low"
      offboarding_action: "reassign_delete" | "soft_delete" | "anonymize"
      order_status:
        | "pending"
        | "accepted"
        | "in_progress"
        | "completed"
        | "disputed"
        | "cancelled"
      order_type: "people_booking" | "product_rfq" | "service" | "trial"
      pitch_prep_status:
        | "draft"
        | "submitted"
        | "in_review"
        | "matched"
        | "in_progress"
        | "completed"
        | "cancelled"
      presence_status: "online" | "away" | "focus" | "offline"
      provider_type:
        | "Legal"
        | "Financial"
        | "VC"
        | "Additive Manufacturing"
        | "Fabrication"
      qa_test_environment: "staging" | "production"
      qa_test_status: "pending" | "running" | "passed" | "failed" | "cancelled"
      rfq_status:
        | "Open"
        | "Bidding"
        | "Awarded"
        | "Closed"
        | "priority_hold"
        | "cancelled"
      rfq_type: "commodity" | "custom" | "service"
      risk_level: "Low" | "Medium" | "High"
      supplier_tier: "verified_partner" | "approved" | "pending" | "suspended"
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
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      account_type: ["team_builder", "supplier"],
      admin_role: [
        "super_admin",
        "operations",
        "support",
        "finance",
        "readonly",
      ],
      conversation_type: [
        "direct",
        "task",
        "objective",
        "expert",
        "marketplace",
      ],
      data_request_status: ["pending", "processing", "completed", "denied"],
      data_request_type: ["access", "deletion", "export"],
      dispute_status: [
        "open",
        "under_review",
        "mediation",
        "arbitration",
        "resolved",
        "escalated",
      ],
      escrow_status: [
        "pending",
        "held",
        "partial_release",
        "released",
        "refunded",
      ],
      feedback_category: ["bug", "idea", "confusion", "praise"],
      funding_stage: [
        "Pre-Seed",
        "Seed",
        "Series A",
        "Series B+",
        "Growth",
        "Bridge",
      ],
      legal_structure: ["Ltd", "Inc", "LLC", "GmbH", "PLC", "Other"],
      marketplace_category: ["People", "Products", "Services", "AI"],
      member_role: ["Executive", "Apprentice", "AI_Agent", "Founder"],
      notification_channel: ["push", "email", "sms", "in_app"],
      notification_priority: ["critical", "high", "medium", "low"],
      offboarding_action: ["reassign_delete", "soft_delete", "anonymize"],
      order_status: [
        "pending",
        "accepted",
        "in_progress",
        "completed",
        "disputed",
        "cancelled",
      ],
      order_type: ["people_booking", "product_rfq", "service", "trial"],
      pitch_prep_status: [
        "draft",
        "submitted",
        "in_review",
        "matched",
        "in_progress",
        "completed",
        "cancelled",
      ],
      presence_status: ["online", "away", "focus", "offline"],
      provider_type: [
        "Legal",
        "Financial",
        "VC",
        "Additive Manufacturing",
        "Fabrication",
      ],
      qa_test_environment: ["staging", "production"],
      qa_test_status: ["pending", "running", "passed", "failed", "cancelled"],
      rfq_status: [
        "Open",
        "Bidding",
        "Awarded",
        "Closed",
        "priority_hold",
        "cancelled",
      ],
      rfq_type: ["commodity", "custom", "service"],
      risk_level: ["Low", "Medium", "High"],
      supplier_tier: ["verified_partner", "approved", "pending", "suspended"],
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
