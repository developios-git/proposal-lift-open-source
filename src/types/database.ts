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
    PostgrestVersion: "14.5"
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
      extension_auth_handoffs: {
        Row: {
          consumed_at: string | null
          created_at: string
          expires_at: string
          handoff_id: string
          user_id: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          handoff_id: string
          user_id: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          handoff_id?: string
          user_id?: string
        }
        Relationships: []
      }
      filter_webhook_state: {
        Row: {
          baseline_pending: boolean
          created_at: string
          filter_id: string
          id: string
          last_checked_at: string
          last_notified_at: string | null
          notified_job_ids: string[]
          updated_at: string
        }
        Insert: {
          baseline_pending?: boolean
          created_at?: string
          filter_id: string
          id?: string
          last_checked_at?: string
          last_notified_at?: string | null
          notified_job_ids?: string[]
          updated_at?: string
        }
        Update: {
          baseline_pending?: boolean
          created_at?: string
          filter_id?: string
          id?: string
          last_checked_at?: string
          last_notified_at?: string | null
          notified_job_ids?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "filter_webhook_state_filter_id_fkey"
            columns: ["filter_id"]
            isOneToOne: true
            referencedRelation: "saved_job_filters"
            referencedColumns: ["id"]
          },
        ]
      }
      hooks: {
        Row: {
          created_at: string | null
          description: string
          id: string
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description: string
          id?: string
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string
          id?: string
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      personas: {
        Row: {
          avatar_url: string | null
          bio: string | null
          certifications: string[]
          created_at: string
          full_name: string | null
          github_url: string | null
          id: string
          linkedin_url: string | null
          location: string | null
          role_title: string | null
          skills: string[]
          specializations: string[]
          timezone: string | null
          updated_at: string
          upwork_person_id: string | null
          upwork_url: string | null
          user_id: string
          website_url: string | null
          years_of_experience: number | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          certifications?: string[]
          created_at?: string
          full_name?: string | null
          github_url?: string | null
          id?: string
          linkedin_url?: string | null
          location?: string | null
          role_title?: string | null
          skills?: string[]
          specializations?: string[]
          timezone?: string | null
          updated_at?: string
          upwork_person_id?: string | null
          upwork_url?: string | null
          user_id: string
          website_url?: string | null
          years_of_experience?: number | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          certifications?: string[]
          created_at?: string
          full_name?: string | null
          github_url?: string | null
          id?: string
          linkedin_url?: string | null
          location?: string | null
          role_title?: string | null
          skills?: string[]
          specializations?: string[]
          timezone?: string | null
          updated_at?: string
          upwork_person_id?: string | null
          upwork_url?: string | null
          user_id?: string
          website_url?: string | null
          years_of_experience?: number | null
        }
        Relationships: []
      }
      portfolio_categories: {
        Row: {
          color: string | null
          created_at: string | null
          id: string
          name: string
          slug: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          id?: string
          name: string
          slug: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string | null
          id?: string
          name?: string
          slug?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      portfolio_tags: {
        Row: {
          created_at: string | null
          id: string
          name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          certifications: string[] | null
          created_at: string | null
          full_name: string | null
          github_url: string | null
          id: string
          is_verified: boolean
          linkedin_url: string | null
          location: string | null
          role_title: string | null
          skills: string[] | null
          specializations: string[] | null
          timezone: string | null
          updated_at: string | null
          upwork_url: string | null
          website_url: string | null
          years_of_experience: number | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          certifications?: string[] | null
          created_at?: string | null
          full_name?: string | null
          github_url?: string | null
          id: string
          is_verified?: boolean
          linkedin_url?: string | null
          location?: string | null
          role_title?: string | null
          skills?: string[] | null
          specializations?: string[] | null
          timezone?: string | null
          updated_at?: string | null
          upwork_url?: string | null
          website_url?: string | null
          years_of_experience?: number | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          certifications?: string[] | null
          created_at?: string | null
          full_name?: string | null
          github_url?: string | null
          id?: string
          is_verified?: boolean
          linkedin_url?: string | null
          location?: string | null
          role_title?: string | null
          skills?: string[] | null
          specializations?: string[] | null
          timezone?: string | null
          updated_at?: string | null
          upwork_url?: string | null
          website_url?: string | null
          years_of_experience?: number | null
        }
        Relationships: []
      }
      project_portfolio_tags: {
        Row: {
          created_at: string | null
          project_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string | null
          project_id: string
          tag_id: string
        }
        Update: {
          created_at?: string | null
          project_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_portfolio_tags_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_portfolio_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "portfolio_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          category: string
          client_name: string | null
          created_at: string | null
          description: string | null
          embedding: string | null
          id: string
          image_url: string | null
          is_featured: boolean | null
          name: string
          technologies: string[] | null
          updated_at: string | null
          upwork_portfolio_item_id: string | null
          url: string | null
          user_id: string
        }
        Insert: {
          category: string
          client_name?: string | null
          created_at?: string | null
          description?: string | null
          embedding?: string | null
          id?: string
          image_url?: string | null
          is_featured?: boolean | null
          name: string
          technologies?: string[] | null
          updated_at?: string | null
          upwork_portfolio_item_id?: string | null
          url?: string | null
          user_id: string
        }
        Update: {
          category?: string
          client_name?: string | null
          created_at?: string | null
          description?: string | null
          embedding?: string | null
          id?: string
          image_url?: string | null
          is_featured?: boolean | null
          name?: string
          technologies?: string[] | null
          updated_at?: string | null
          upwork_portfolio_item_id?: string | null
          url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      proposals: {
        Row: {
          ai_model: string | null
          ai_provider: string | null
          client_name: string
          created_at: string | null
          id: string
          job_description: string | null
          job_title: string
          job_url: string | null
          notes: string | null
          persona_id: string | null
          proposal_content: string
          selected_projects: string[] | null
          status: string | null
          template_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          ai_model?: string | null
          ai_provider?: string | null
          client_name: string
          created_at?: string | null
          id?: string
          job_description?: string | null
          job_title: string
          job_url?: string | null
          notes?: string | null
          persona_id?: string | null
          proposal_content: string
          selected_projects?: string[] | null
          status?: string | null
          template_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          ai_model?: string | null
          ai_provider?: string | null
          client_name?: string
          created_at?: string | null
          id?: string
          job_description?: string | null
          job_title?: string
          job_url?: string | null
          notes?: string | null
          persona_id?: string | null
          proposal_content?: string
          selected_projects?: string[] | null
          status?: string | null
          template_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposals_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_job_filters: {
        Row: {
          auto_refresh_jobs_enabled: boolean
          created_at: string | null
          filters: Json
          id: string
          is_default: boolean | null
          is_enabled: boolean
          name: string
          notification_enabled: boolean | null
          qualify_criteria: string | null
          qualify_enabled: boolean
          user_id: string
        }
        Insert: {
          auto_refresh_jobs_enabled?: boolean
          created_at?: string | null
          filters?: Json
          id?: string
          is_default?: boolean | null
          is_enabled?: boolean
          name: string
          notification_enabled?: boolean | null
          qualify_criteria?: string | null
          qualify_enabled?: boolean
          user_id: string
        }
        Update: {
          auto_refresh_jobs_enabled?: boolean
          created_at?: string | null
          filters?: Json
          id?: string
          is_default?: boolean | null
          is_enabled?: boolean
          name?: string
          notification_enabled?: boolean | null
          qualify_criteria?: string | null
          qualify_enabled?: boolean
          user_id?: string
        }
        Relationships: []
      }
      templates: {
        Row: {
          category: string
          content: string
          created_at: string | null
          description: string | null
          id: string
          is_default: boolean | null
          name: string
          updated_at: string | null
          user_id: string
          variables: string[] | null
        }
        Insert: {
          category: string
          content: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          updated_at?: string | null
          user_id: string
          variables?: string[] | null
        }
        Update: {
          category?: string
          content?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          updated_at?: string | null
          user_id?: string
          variables?: string[] | null
        }
        Relationships: []
      }
      upwork_api_usage: {
        Row: {
          call_count: number
          date: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          call_count?: number
          date?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          call_count?: number
          date?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_onboarding_state: {
        Row: {
          completed_at: string | null
          created_at: string
          current_step: number
          flow_id: string
          flow_version: number
          id: string
          skipped_at: string | null
          status: Database["public"]["Enums"]["onboarding_flow_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_step?: number
          flow_id: string
          flow_version?: number
          id?: string
          skipped_at?: string | null
          status?: Database["public"]["Enums"]["onboarding_flow_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_step?: number
          flow_id?: string
          flow_version?: number
          id?: string
          skipped_at?: string | null
          status?: Database["public"]["Enums"]["onboarding_flow_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_presence: {
        Row: {
          last_seen_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          last_seen_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          last_seen_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          anthropic_api_key: string | null
          anthropic_effort: string | null
          anthropic_max_tokens: number | null
          anthropic_model: string | null
          created_at: string
          fallback_model: string | null
          id: string
          job_feed_auto_refresh_enabled: boolean
          knowledge_base: string | null
          openai_api_key: string | null
          openai_effort: string | null
          openai_max_tokens: number | null
          openai_model: string | null
          system_prompt: string | null
          updated_at: string
          upwork_access_token: string | null
          upwork_client_id: string | null
          upwork_client_secret_encrypted: string | null
          upwork_connected_at: string | null
          upwork_oauth_credentials_updated_at: string | null
          upwork_refresh_token: string | null
          upwork_search_terms: string | null
          upwork_token_expires_at: string | null
          upwork_vendor_orgs: Json | null
          upwork_vendor_orgs_client_only: boolean | null
          upwork_vendor_orgs_fetched_at: string | null
          user_id: string
        }
        Insert: {
          anthropic_api_key?: string | null
          anthropic_effort?: string | null
          anthropic_max_tokens?: number | null
          anthropic_model?: string | null
          created_at?: string
          fallback_model?: string | null
          id?: string
          job_feed_auto_refresh_enabled?: boolean
          knowledge_base?: string | null
          openai_api_key?: string | null
          openai_effort?: string | null
          openai_max_tokens?: number | null
          openai_model?: string | null
          system_prompt?: string | null
          updated_at?: string
          upwork_access_token?: string | null
          upwork_client_id?: string | null
          upwork_client_secret_encrypted?: string | null
          upwork_connected_at?: string | null
          upwork_oauth_credentials_updated_at?: string | null
          upwork_refresh_token?: string | null
          upwork_search_terms?: string | null
          upwork_token_expires_at?: string | null
          upwork_vendor_orgs?: Json | null
          upwork_vendor_orgs_client_only?: boolean | null
          upwork_vendor_orgs_fetched_at?: string | null
          user_id: string
        }
        Update: {
          anthropic_api_key?: string | null
          anthropic_effort?: string | null
          anthropic_max_tokens?: number | null
          anthropic_model?: string | null
          created_at?: string
          fallback_model?: string | null
          id?: string
          job_feed_auto_refresh_enabled?: boolean
          knowledge_base?: string | null
          openai_api_key?: string | null
          openai_effort?: string | null
          openai_max_tokens?: number | null
          openai_model?: string | null
          system_prompt?: string | null
          updated_at?: string
          upwork_access_token?: string | null
          upwork_client_id?: string | null
          upwork_client_secret_encrypted?: string | null
          upwork_connected_at?: string | null
          upwork_oauth_credentials_updated_at?: string | null
          upwork_refresh_token?: string | null
          upwork_search_terms?: string | null
          upwork_token_expires_at?: string | null
          upwork_vendor_orgs?: Json | null
          upwork_vendor_orgs_client_only?: boolean | null
          upwork_vendor_orgs_fetched_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      webhook_configurations: {
        Row: {
          consecutive_failures: number
          created_at: string
          id: string
          is_active: boolean
          last_failure_at: string | null
          name: string
          platform_hint: string
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          consecutive_failures?: number
          created_at?: string
          id?: string
          is_active?: boolean
          last_failure_at?: string | null
          name: string
          platform_hint?: string
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          consecutive_failures?: number
          created_at?: string
          id?: string
          is_active?: boolean
          last_failure_at?: string | null
          name?: string
          platform_hint?: string
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      webhook_delivery_log: {
        Row: {
          delivered_at: string
          filter_id: string
          id: string
          job_count: number
          response_body: string | null
          run_id: string
          status_code: number | null
          webhook_id: string
        }
        Insert: {
          delivered_at?: string
          filter_id: string
          id?: string
          job_count: number
          response_body?: string | null
          run_id: string
          status_code?: number | null
          webhook_id: string
        }
        Update: {
          delivered_at?: string
          filter_id?: string
          id?: string
          job_count?: number
          response_body?: string | null
          run_id?: string
          status_code?: number | null
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_delivery_log_filter_id_fkey"
            columns: ["filter_id"]
            isOneToOne: false
            referencedRelation: "saved_job_filters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_delivery_log_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhook_configurations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      increment_upwork_api_usage: {
        Args: { p_date: string; p_user_id: string }
        Returns: number
      }
      match_portfolio_projects: {
        Args: {
          match_count?: number
          p_user_id: string
          query_embedding: string
        }
        Returns: {
          category: string
          description: string
          id: string
          name: string
          similarity: number
          technologies: string[]
          url: string
        }[]
      }
    }
    Enums: {
      onboarding_flow_status:
        | "not_started"
        | "in_progress"
        | "completed"
        | "skipped"
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
      onboarding_flow_status: [
        "not_started",
        "in_progress",
        "completed",
        "skipped",
      ],
    },
  },
} as const
