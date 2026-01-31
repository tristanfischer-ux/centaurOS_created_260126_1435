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
      conversations: {
        Row: {
          buyer_id: string
          created_at: string | null
          id: string
          listing_id: string | null
          order_id: string | null
          rfq_id: string | null
          seller_id: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          buyer_id: string
          created_at?: string | null
          id?: string
          listing_id?: string | null
          order_id?: string | null
          rfq_id?: string | null
          seller_id: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          buyer_id?: string
          created_at?: string | null
          id?: string
          listing_id?: string | null
          order_id?: string | null
          rfq_id?: string | null
          seller_id?: string
          status?: string | null
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
      foundries: {
        Row: {
          created_at: string | null
          id: string
          industry: string | null
          name: string
          owner_id: string | null
          slug: string | null
          stage: string | null
        }
        Insert: {
          created_at?: string | null
          id: string
          industry?: string | null
          name: string
          owner_id?: string | null
          slug?: string | null
          stage?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          industry?: string | null
          name?: string
          owner_id?: string | null
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
          id: string
          image_url: string | null
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
          id?: string
          image_url?: string | null
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
          id?: string
          image_url?: string | null
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
          message_type: string | null
          sender_id: string
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string | null
          file_url?: string | null
          id?: string
          is_read?: boolean | null
          message_type?: string | null
          sender_id: string
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string | null
          file_url?: string | null
          id?: string
          is_read?: boolean | null
          message_type?: string | null
          sender_id?: string
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
          extended_description: string | null
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
          extended_description?: string | null
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
          extended_description?: string | null
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
          business_function_id: string | null
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
          business_function_id?: string | null
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
          business_function_id?: string | null
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
            foreignKeyName: "orders_business_function_id_fkey"
            columns: ["business_function_id"]
            isOneToOne: false
            referencedRelation: "business_functions"
            referencedColumns: ["id"]
          },
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
          role: Database["public"]["Enums"]["member_role"]
          skills: string[] | null
          stripe_account_id: string | null
          updated_at: string | null
          years_experience: number | null
        }
        Insert: {
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
          role?: Database["public"]["Enums"]["member_role"]
          skills?: string[] | null
          stripe_account_id?: string | null
          updated_at?: string | null
          years_experience?: number | null
        }
        Update: {
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
          role?: Database["public"]["Enums"]["member_role"]
          skills?: string[] | null
          stripe_account_id?: string | null
          updated_at?: string | null
          years_experience?: number | null
        }
        Relationships: [
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
          user_id: string
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
          user_id: string
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
          user_id?: string
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
          centaur_discount_percent: number | null
          company_stages: string[] | null
          completion_rate: number | null
          created_at: string | null
          currency: string | null
          current_order_count: number | null
          day_rate: number | null
          featured_until: string | null
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
          centaur_discount_percent?: number | null
          company_stages?: string[] | null
          completion_rate?: number | null
          created_at?: string | null
          currency?: string | null
          current_order_count?: number | null
          day_rate?: number | null
          featured_until?: string | null
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
          centaur_discount_percent?: number | null
          company_stages?: string[] | null
          completion_rate?: number | null
          created_at?: string | null
          currency?: string | null
          current_order_count?: number | null
          day_rate?: number | null
          featured_until?: string | null
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
      stripe_events: {
        Row: {
          created_at: string | null
          error: string | null
          event_type: string
          id: string
          payload: Json
          processed: boolean | null
          processed_at: string | null
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
          retry_count?: number | null
          stripe_event_id?: string
          updated_at?: string | null
        }
        Relationships: []
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
    }
    Views: {
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
      generate_gap_recommendations: {
        Args: { p_foundry_id: string }
        Returns: number
      }
      generate_profile_slug: {
        Args: { full_name: string; user_id: string }
        Returns: string
      }
      get_buyer_spend: {
        Args: { p_buyer_id: string; p_end_date: string; p_start_date: string }
        Returns: {
          date: string
          order_count: number
          spend: number
        }[]
      }
      get_escrow_balance_atomic: {
        Args: { p_order_id: string }
        Returns: {
          available_balance: number
          total_held: number
          total_released: number
        }[]
      }
      get_foundry_coverage_summary: {
        Args: { p_foundry_id: string }
        Returns: {
          category: string
          covered: number
          gaps: number
          not_needed: number
          partial: number
          total_functions: number
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
      get_weekly_otjt_target: {
        Args: { enrollment_id: string }
        Returns: number
      }
      has_foundry_admin_access: {
        Args: { target_foundry_id: string; user_id: string }
        Returns: boolean
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
      is_active_user: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_otjt_on_track: { Args: { enrollment_id: string }; Returns: boolean }
      refresh_all_analytics: { Args: never; Returns: undefined }
      refresh_buyer_stats: { Args: never; Returns: undefined }
      refresh_platform_stats: { Args: never; Returns: undefined }
      refresh_provider_stats: { Args: never; Returns: undefined }
      refresh_search_ranking: { Args: never; Returns: undefined }
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
      update_trending_searches: { Args: never; Returns: undefined }
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
      admin_role:
        | "super_admin"
        | "operations"
        | "support"
        | "finance"
        | "readonly"
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
      presence_status: "online" | "away" | "focus" | "offline"
      provider_type:
        | "Legal"
        | "Financial"
        | "VC"
        | "Additive Manufacturing"
        | "Fabrication"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      admin_role: [
        "super_admin",
        "operations",
        "support",
        "finance",
        "readonly",
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
      presence_status: ["online", "away", "focus", "offline"],
      provider_type: [
        "Legal",
        "Financial",
        "VC",
        "Additive Manufacturing",
        "Fabrication",
      ],
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
