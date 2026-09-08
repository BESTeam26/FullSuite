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
      activity_events: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          agency_id: string
          body: Json | null
          created_at: string
          detail: string | null
          entity_id: string
          entity_type: string
          field: string | null
          id: number
          mark: string | null
          new_value: string | null
          organization_id: string | null
          pinned: boolean
          previous_value: string | null
          visibility: Database["public"]["Enums"]["activity_visibility"]
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          agency_id: string
          body?: Json | null
          created_at?: string
          detail?: string | null
          entity_id: string
          entity_type: string
          field?: string | null
          id?: never
          mark?: string | null
          new_value?: string | null
          organization_id?: string | null
          pinned?: boolean
          previous_value?: string | null
          visibility?: Database["public"]["Enums"]["activity_visibility"]
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          agency_id?: string
          body?: Json | null
          created_at?: string
          detail?: string | null
          entity_id?: string
          entity_type?: string
          field?: string | null
          id?: never
          mark?: string | null
          new_value?: string | null
          organization_id?: string | null
          pinned?: boolean
          previous_value?: string | null
          visibility?: Database["public"]["Enums"]["activity_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "activity_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agencies: {
        Row: {
          branding: Json
          created_at: string
          eod_auto_submit: boolean
          eod_cutoff_local: string | null
          eod_timezone: string
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          branding?: Json
          created_at?: string
          eod_auto_submit?: boolean
          eod_cutoff_local?: string | null
          eod_timezone?: string
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          branding?: Json
          created_at?: string
          eod_auto_submit?: boolean
          eod_cutoff_local?: string | null
          eod_timezone?: string
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      agency_calendar_events: {
        Row: {
          agency_id: string
          created_at: string
          created_by: string | null
          event_date: string
          id: string
          kind: Database["public"]["Enums"]["agency_event_kind"]
          name: string
          non_working: boolean
          notes: string | null
          observed_date: string
          rule_version: string | null
          source_key: string | null
          system_managed: boolean
          updated_at: string
        }
        Insert: {
          agency_id: string
          created_at?: string
          created_by?: string | null
          event_date: string
          id?: string
          kind: Database["public"]["Enums"]["agency_event_kind"]
          name: string
          non_working?: boolean
          notes?: string | null
          observed_date: string
          rule_version?: string | null
          source_key?: string | null
          system_managed?: boolean
          updated_at?: string
        }
        Update: {
          agency_id?: string
          created_at?: string
          created_by?: string | null
          event_date?: string
          id?: string
          kind?: Database["public"]["Enums"]["agency_event_kind"]
          name?: string
          non_working?: boolean
          notes?: string | null
          observed_date?: string
          rule_version?: string | null
          source_key?: string | null
          system_managed?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_calendar_events_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_calendar_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_communication_settings: {
        Row: {
          agency_id: string
          guard_enabled: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          agency_id: string
          guard_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          agency_id?: string
          guard_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agency_communication_settings_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: true
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_communication_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_expense_templates: {
        Row: {
          active: boolean
          agency_id: string
          amount_cents: number
          cadence: string
          category: string | null
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          due_day: number | null
          id: string
          notes: string | null
          payment_method: string | null
          transaction_type: string | null
          updated_at: string
          vendor: string
        }
        Insert: {
          active?: boolean
          agency_id: string
          amount_cents: number
          cadence?: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          due_day?: number | null
          id?: string
          notes?: string | null
          payment_method?: string | null
          transaction_type?: string | null
          updated_at?: string
          vendor: string
        }
        Update: {
          active?: boolean
          agency_id?: string
          amount_cents?: number
          cadence?: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          due_day?: number | null
          id?: string
          notes?: string | null
          payment_method?: string | null
          transaction_type?: string | null
          updated_at?: string
          vendor?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_expense_templates_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_expense_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_expenses: {
        Row: {
          agency_id: string
          amount_cents: number
          category: string | null
          created_at: string
          currency: string
          description: string | null
          due_date: string | null
          fx_rate_used: number | null
          id: string
          invoice_url: string | null
          notes: string | null
          paid_on: string | null
          payment_method: string | null
          receipt_url: string | null
          recorded_by: string | null
          status: Database["public"]["Enums"]["expense_status"]
          template_id: string | null
          transaction_type: string | null
          updated_at: string
          vendor: string
        }
        Insert: {
          agency_id: string
          amount_cents: number
          category?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          due_date?: string | null
          fx_rate_used?: number | null
          id?: string
          invoice_url?: string | null
          notes?: string | null
          paid_on?: string | null
          payment_method?: string | null
          receipt_url?: string | null
          recorded_by?: string | null
          status?: Database["public"]["Enums"]["expense_status"]
          template_id?: string | null
          transaction_type?: string | null
          updated_at?: string
          vendor: string
        }
        Update: {
          agency_id?: string
          amount_cents?: number
          category?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          due_date?: string | null
          fx_rate_used?: number | null
          id?: string
          invoice_url?: string | null
          notes?: string | null
          paid_on?: string | null
          payment_method?: string | null
          receipt_url?: string | null
          recorded_by?: string | null
          status?: Database["public"]["Enums"]["expense_status"]
          template_id?: string | null
          transaction_type?: string | null
          updated_at?: string
          vendor?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_expenses_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_expenses_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_expenses_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "agency_expense_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_meeting_credentials: {
        Row: {
          access_token: string | null
          agency_id: string
          expires_at: string | null
          provider: Database["public"]["Enums"]["meeting_provider"]
          refresh_token: string | null
          scope: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          agency_id: string
          expires_at?: string | null
          provider: Database["public"]["Enums"]["meeting_provider"]
          refresh_token?: string | null
          scope?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          agency_id?: string
          expires_at?: string | null
          provider?: Database["public"]["Enums"]["meeting_provider"]
          refresh_token?: string | null
          scope?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_meeting_credentials_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_meeting_providers: {
        Row: {
          account_label: string | null
          agency_id: string
          connected: boolean
          connected_at: string | null
          connected_by: string | null
          provider: Database["public"]["Enums"]["meeting_provider"]
          updated_at: string
        }
        Insert: {
          account_label?: string | null
          agency_id: string
          connected?: boolean
          connected_at?: string | null
          connected_by?: string | null
          provider: Database["public"]["Enums"]["meeting_provider"]
          updated_at?: string
        }
        Update: {
          account_label?: string | null
          agency_id?: string
          connected?: boolean
          connected_at?: string | null
          connected_by?: string | null
          provider?: Database["public"]["Enums"]["meeting_provider"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_meeting_providers_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_meeting_providers_connected_by_fkey"
            columns: ["connected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_member_permissions: {
        Row: {
          allowed: boolean
          key: string
          membership_id: string
          reason: string | null
          set_at: string
          set_by: string | null
        }
        Insert: {
          allowed: boolean
          key: string
          membership_id: string
          reason?: string | null
          set_at?: string
          set_by?: string | null
        }
        Update: {
          allowed?: boolean
          key?: string
          membership_id?: string
          reason?: string | null
          set_at?: string
          set_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agency_member_permissions_key_fkey"
            columns: ["key"]
            isOneToOne: false
            referencedRelation: "permission_keys"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "agency_member_permissions_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "agency_memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_member_permissions_set_by_fkey"
            columns: ["set_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_memberships: {
        Row: {
          agency_id: string
          created_at: string
          deactivated_at: string | null
          deactivated_by: string | null
          id: string
          job_title: string | null
          manager_id: string | null
          primary_department_id: string | null
          primary_division_id: string | null
          primary_team_id: string | null
          role: Database["public"]["Enums"]["agency_role"]
          scope: Database["public"]["Enums"]["access_scope"]
          scope_department_id: string | null
          scope_division:
            | Database["public"]["Enums"]["fulfillment_service"]
            | null
          status: string
          user_id: string
        }
        Insert: {
          agency_id: string
          created_at?: string
          deactivated_at?: string | null
          deactivated_by?: string | null
          id?: string
          job_title?: string | null
          manager_id?: string | null
          primary_department_id?: string | null
          primary_division_id?: string | null
          primary_team_id?: string | null
          role?: Database["public"]["Enums"]["agency_role"]
          scope?: Database["public"]["Enums"]["access_scope"]
          scope_department_id?: string | null
          scope_division?:
            | Database["public"]["Enums"]["fulfillment_service"]
            | null
          status?: string
          user_id: string
        }
        Update: {
          agency_id?: string
          created_at?: string
          deactivated_at?: string | null
          deactivated_by?: string | null
          id?: string
          job_title?: string | null
          manager_id?: string | null
          primary_department_id?: string | null
          primary_division_id?: string | null
          primary_team_id?: string | null
          role?: Database["public"]["Enums"]["agency_role"]
          scope?: Database["public"]["Enums"]["access_scope"]
          scope_department_id?: string | null
          scope_division?:
            | Database["public"]["Enums"]["fulfillment_service"]
            | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_memberships_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_memberships_deactivated_by_fkey"
            columns: ["deactivated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_memberships_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_memberships_primary_department_id_fkey"
            columns: ["primary_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_memberships_primary_division_id_fkey"
            columns: ["primary_division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_memberships_primary_team_id_fkey"
            columns: ["primary_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_memberships_scope_department_id_fkey"
            columns: ["scope_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_role_permissions: {
        Row: {
          agency_id: string | null
          allowed: boolean
          key: string
          role: Database["public"]["Enums"]["agency_role"]
        }
        Insert: {
          agency_id?: string | null
          allowed: boolean
          key: string
          role: Database["public"]["Enums"]["agency_role"]
        }
        Update: {
          agency_id?: string | null
          allowed?: boolean
          key?: string
          role?: Database["public"]["Enums"]["agency_role"]
        }
        Relationships: [
          {
            foreignKeyName: "agency_role_permissions_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_role_permissions_key_fkey"
            columns: ["key"]
            isOneToOne: false
            referencedRelation: "permission_keys"
            referencedColumns: ["key"]
          },
        ]
      }
      ai_credit_ledger: {
        Row: {
          created_at: string
          created_by: string | null
          delta_credits: number
          id: string
          kind: string
          organization_id: string
          reference: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delta_credits: number
          id?: string
          kind: string
          organization_id: string
          reference?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delta_credits?: number
          id?: string
          kind?: string
          organization_id?: string
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_credit_ledger_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_credit_ledger_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_credit_packs: {
        Row: {
          credits: number
          is_active: boolean
          key: string
          label: string
          price_cents: number
          sort: number
        }
        Insert: {
          credits: number
          is_active?: boolean
          key: string
          label: string
          price_cents: number
          sort?: number
        }
        Update: {
          credits?: number
          is_active?: boolean
          key?: string
          label?: string
          price_cents?: number
          sort?: number
        }
        Relationships: []
      }
      ai_features: {
        Row: {
          active: boolean
          key: string
          label: string
          min_plan: string | null
          product: Database["public"]["Enums"]["product_key"] | null
          sort: number
        }
        Insert: {
          active?: boolean
          key: string
          label: string
          min_plan?: string | null
          product?: Database["public"]["Enums"]["product_key"] | null
          sort?: number
        }
        Update: {
          active?: boolean
          key?: string
          label?: string
          min_plan?: string | null
          product?: Database["public"]["Enums"]["product_key"] | null
          sort?: number
        }
        Relationships: []
      }
      ai_limits: {
        Row: {
          daily_spend_cap_credits: number
          id: string
          max_output_tokens: number
          max_pages: number
          max_upload_mb: number
          organization_id: string | null
          per_request_cap_credits: number
          requests_per_hour: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          daily_spend_cap_credits?: number
          id?: string
          max_output_tokens?: number
          max_pages?: number
          max_upload_mb?: number
          organization_id?: string | null
          per_request_cap_credits?: number
          requests_per_hour?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          daily_spend_cap_credits?: number
          id?: string
          max_output_tokens?: number
          max_pages?: number
          max_upload_mb?: number
          organization_id?: string | null
          per_request_cap_credits?: number
          requests_per_hour?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_limits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_limits_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_pricing_policy: {
        Row: {
          cached_cost_per_million: number
          created_at: string
          created_by: string | null
          credits_per_usd: number
          effective_from: string
          effective_until: string | null
          id: string
          input_cost_per_million: number
          markup_multiplier: number
          model: string
          output_cost_per_million: number
          price_confirmed_at: string | null
          source_note: string | null
        }
        Insert: {
          cached_cost_per_million?: number
          created_at?: string
          created_by?: string | null
          credits_per_usd?: number
          effective_from?: string
          effective_until?: string | null
          id?: string
          input_cost_per_million: number
          markup_multiplier?: number
          model: string
          output_cost_per_million: number
          price_confirmed_at?: string | null
          source_note?: string | null
        }
        Update: {
          cached_cost_per_million?: number
          created_at?: string
          created_by?: string | null
          credits_per_usd?: number
          effective_from?: string
          effective_until?: string | null
          id?: string
          input_cost_per_million?: number
          markup_multiplier?: number
          model?: string
          output_cost_per_million?: number
          price_confirmed_at?: string | null
          source_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_pricing_policy_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_recharge_settings: {
        Row: {
          enabled: boolean
          organization_id: string
          pack_usd: number
          threshold: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled?: boolean
          organization_id: string
          pack_usd?: number
          threshold?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          organization_id?: string
          pack_usd?: number
          threshold?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_recharge_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_recharge_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_reservations: {
        Row: {
          created_at: string
          estimated_credits: number
          expires_at: string
          feature_key: string
          id: string
          model: string
          organization_id: string
          settled_at: string | null
          status: Database["public"]["Enums"]["ai_reservation_status"]
          usage_event_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          estimated_credits: number
          expires_at?: string
          feature_key: string
          id?: string
          model: string
          organization_id: string
          settled_at?: string | null
          status?: Database["public"]["Enums"]["ai_reservation_status"]
          usage_event_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          estimated_credits?: number
          expires_at?: string
          feature_key?: string
          id?: string
          model?: string
          organization_id?: string
          settled_at?: string | null
          status?: Database["public"]["Enums"]["ai_reservation_status"]
          usage_event_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_reservations_feature_key_fkey"
            columns: ["feature_key"]
            isOneToOne: false
            referencedRelation: "ai_features"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "ai_reservations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_reservations_usage_event_id_fkey"
            columns: ["usage_event_id"]
            isOneToOne: false
            referencedRelation: "ai_usage_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_reservations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_events: {
        Row: {
          cached_tokens: number
          created_at: string
          credits_charged: number
          feature_key: string
          id: string
          input_tokens: number
          model: string
          organization_id: string
          output_tokens: number
          product: Database["public"]["Enums"]["product_key"] | null
          provider_cost_cents: number
          request_id: string
          user_id: string | null
        }
        Insert: {
          cached_tokens?: number
          created_at?: string
          credits_charged?: number
          feature_key: string
          id?: string
          input_tokens?: number
          model: string
          organization_id: string
          output_tokens?: number
          product?: Database["public"]["Enums"]["product_key"] | null
          provider_cost_cents?: number
          request_id: string
          user_id?: string | null
        }
        Update: {
          cached_tokens?: number
          created_at?: string
          credits_charged?: number
          feature_key?: string
          id?: string
          input_tokens?: number
          model?: string
          organization_id?: string
          output_tokens?: number
          product?: Database["public"]["Enums"]["product_key"] | null
          provider_cost_cents?: number
          request_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_events_feature_key_fkey"
            columns: ["feature_key"]
            isOneToOne: false
            referencedRelation: "ai_features"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "ai_usage_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          agency_id: string | null
          archived_at: string | null
          audience: Database["public"]["Enums"]["announcement_audience"]
          body: string
          created_at: string
          created_by: string | null
          department_id: string | null
          id: string
          managers_only: boolean
          organization_id: string | null
          pinned: boolean
          published_at: string | null
          source_key: string | null
          tag: string | null
          team_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          agency_id?: string | null
          archived_at?: string | null
          audience?: Database["public"]["Enums"]["announcement_audience"]
          body: string
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          id?: string
          managers_only?: boolean
          organization_id?: string | null
          pinned?: boolean
          published_at?: string | null
          source_key?: string | null
          tag?: string | null
          team_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          agency_id?: string | null
          archived_at?: string | null
          audience?: Database["public"]["Enums"]["announcement_audience"]
          body?: string
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          id?: string
          managers_only?: boolean
          organization_id?: string | null
          pinned?: boolean
          published_at?: string | null
          source_key?: string | null
          tag?: string | null
          team_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          after: Json | null
          agency_id: string | null
          before: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: number
          organization_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          after?: Json | null
          agency_id?: string | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: never
          organization_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          after?: Json | null
          agency_id?: string | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: never
          organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      blocked_email_domains: {
        Row: {
          domain: string
          reason: string
        }
        Insert: {
          domain: string
          reason?: string
        }
        Update: {
          domain?: string
          reason?: string
        }
        Relationships: []
      }
      businesses: {
        Row: {
          created_at: string
          ein_last4: string | null
          id: string
          industry: string | null
          legal_name: string | null
          monthly_revenue: number | null
          name: string
          organization_id: string
          time_in_business_months: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          ein_last4?: string | null
          id?: string
          industry?: string | null
          legal_name?: string | null
          monthly_revenue?: number | null
          name: string
          organization_id: string
          time_in_business_months?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          ein_last4?: string | null
          id?: string
          industry?: string | null
          legal_name?: string | null
          monthly_revenue?: number | null
          name?: string
          organization_id?: string
          time_in_business_months?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "businesses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_members: {
        Row: {
          channel_id: string
          is_manager: boolean
          joined_at: string
          user_id: string
        }
        Insert: {
          channel_id: string
          is_manager?: boolean
          joined_at?: string
          user_id: string
        }
        Update: {
          channel_id?: string
          is_manager?: boolean
          joined_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_members_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_reads: {
        Row: {
          channel_id: string
          last_read_at: string
          user_id: string
        }
        Insert: {
          channel_id: string
          last_read_at?: string
          user_id: string
        }
        Update: {
          channel_id?: string
          last_read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_reads_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_shares: {
        Row: {
          channel_id: string
          created_at: string
          created_by: string
          engagement_id: string
          id: string
          revoked_at: string | null
          revoked_by: string | null
        }
        Insert: {
          channel_id: string
          created_at?: string
          created_by: string
          engagement_id: string
          id?: string
          revoked_at?: string | null
          revoked_by?: string | null
        }
        Update: {
          channel_id?: string
          created_at?: string
          created_by?: string
          engagement_id?: string
          id?: string
          revoked_at?: string | null
          revoked_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_shares_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_shares_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_shares_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "fulfillment_engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_shares_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_teams: {
        Row: {
          added_at: string
          added_by: string | null
          channel_id: string
          team_id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          channel_id: string
          team_id: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          channel_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_teams_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_teams_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_teams_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          agency_id: string | null
          archived_at: string | null
          created_at: string
          created_by: string | null
          department_id: string | null
          id: string
          kind: Database["public"]["Enums"]["channel_kind"]
          name: string
          open_to_scope: boolean
          organization_id: string | null
          partner_group_id: string | null
          partner_service_id: string | null
          purpose: string | null
          system_key: string | null
        }
        Insert: {
          agency_id?: string | null
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["channel_kind"]
          name: string
          open_to_scope?: boolean
          organization_id?: string | null
          partner_group_id?: string | null
          partner_service_id?: string | null
          purpose?: string | null
          system_key?: string | null
        }
        Update: {
          agency_id?: string | null
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["channel_kind"]
          name?: string
          open_to_scope?: boolean
          organization_id?: string | null
          partner_group_id?: string | null
          partner_service_id?: string | null
          purpose?: string | null
          system_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channels_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channels_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channels_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "organization_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channels_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channels_partner_group_id_fkey"
            columns: ["partner_group_id"]
            isOneToOne: false
            referencedRelation: "outsourcing_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channels_partner_service_id_fkey"
            columns: ["partner_service_id"]
            isOneToOne: false
            referencedRelation: "partner_services"
            referencedColumns: ["id"]
          },
        ]
      }
      client_department_statuses: {
        Row: {
          assignee_id: string | null
          client_id: string
          department: Database["public"]["Enums"]["fulfillment_department"]
          status: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          client_id: string
          department: Database["public"]["Enums"]["fulfillment_department"]
          status: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          client_id?: string
          department?: Database["public"]["Enums"]["fulfillment_department"]
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_department_statuses_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_department_statuses_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "fulfillment_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_round_outcomes: {
        Row: {
          bureau: string
          client_id: string
          created_at: string
          deleted: number
          id: string
          items_disputed: number
          note: string | null
          outcome_date: string
          recorded_by: string | null
          round_number: number
          source: string
          updated: number
          verified: number
        }
        Insert: {
          bureau: string
          client_id: string
          created_at?: string
          deleted?: number
          id?: string
          items_disputed?: number
          note?: string | null
          outcome_date?: string
          recorded_by?: string | null
          round_number: number
          source?: string
          updated?: number
          verified?: number
        }
        Update: {
          bureau?: string
          client_id?: string
          created_at?: string
          deleted?: number
          id?: string
          items_disputed?: number
          note?: string | null
          outcome_date?: string
          recorded_by?: string | null
          round_number?: number
          source?: string
          updated?: number
          verified?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_round_outcomes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "fulfillment_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_round_outcomes_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          agency_id: string
          city: string | null
          created_at: string
          created_by: string | null
          date_of_birth: string | null
          email: string
          first_name: string | null
          full_name: string | null
          id: string
          last_name: string
          mode: Database["public"]["Enums"]["fulfillment_mode"]
          needs_review: boolean
          organization_id: string | null
          outsourcing_group_id: string | null
          partner_scope_id: string | null
          phone: string | null
          portal_user_id: string | null
          postal_code: string | null
          preferred_name: string | null
          provenance: Database["public"]["Enums"]["client_provenance"]
          public_id: string
          review_note: string | null
          state: string | null
          status: Database["public"]["Enums"]["client_status"]
          updated_at: string
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          agency_id: string
          city?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          email: string
          first_name?: string | null
          full_name?: string | null
          id?: string
          last_name: string
          mode: Database["public"]["Enums"]["fulfillment_mode"]
          needs_review?: boolean
          organization_id?: string | null
          outsourcing_group_id?: string | null
          partner_scope_id?: string | null
          phone?: string | null
          portal_user_id?: string | null
          postal_code?: string | null
          preferred_name?: string | null
          provenance: Database["public"]["Enums"]["client_provenance"]
          public_id?: string
          review_note?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          agency_id?: string
          city?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          email?: string
          first_name?: string | null
          full_name?: string | null
          id?: string
          last_name?: string
          mode?: Database["public"]["Enums"]["fulfillment_mode"]
          needs_review?: boolean
          organization_id?: string | null
          outsourcing_group_id?: string | null
          partner_scope_id?: string | null
          phone?: string | null
          portal_user_id?: string | null
          postal_code?: string | null
          preferred_name?: string | null
          provenance?: Database["public"]["Enums"]["client_provenance"]
          public_id?: string
          review_note?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_outsourcing_group_id_fkey"
            columns: ["outsourcing_group_id"]
            isOneToOne: false
            referencedRelation: "outsourcing_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      closings: {
        Row: {
          file_id: string
          id: string
          note: string | null
          offer_id: string
          signed_at: string | null
          started_at: string
          started_by: string | null
          status: Database["public"]["Enums"]["closing_status"]
          updated_at: string
        }
        Insert: {
          file_id: string
          id?: string
          note?: string | null
          offer_id: string
          signed_at?: string | null
          started_at?: string
          started_by?: string | null
          status?: Database["public"]["Enums"]["closing_status"]
          updated_at?: string
        }
        Update: {
          file_id?: string
          id?: string
          note?: string | null
          offer_id?: string
          signed_at?: string | null
          started_at?: string
          started_by?: string | null
          status?: Database["public"]["Enums"]["closing_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "closings_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "borrower_funding_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closings_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "funding_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closings_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closings_started_by_fkey"
            columns: ["started_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_plans: {
        Row: {
          applies_to: string
          basis: string
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          label: string
          organization_id: string
          party_id: string | null
          party_kind: string
          rate_or_amount: number
        }
        Insert: {
          applies_to?: string
          basis: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          label: string
          organization_id: string
          party_id?: string | null
          party_kind: string
          rate_or_amount: number
        }
        Update: {
          applies_to?: string
          basis?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          label?: string
          organization_id?: string
          party_id?: string | null
          party_kind?: string
          rate_or_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "commission_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_plans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      commissions: {
        Row: {
          basis: string
          basis_amount: number | null
          computed_amount: number | null
          created_at: string
          created_by: string | null
          deal_id: string | null
          earned_at: string | null
          funded_at: string | null
          id: string
          note: string | null
          paid_at: string | null
          party_id: string
          party_kind: string
          payable_at: string | null
          payment_reference: string | null
          plan_id: string | null
          rate_or_amount: number
          referral_event_id: string | null
          reversed_at: string | null
          state: string
          updated_at: string
        }
        Insert: {
          basis: string
          basis_amount?: number | null
          computed_amount?: number | null
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          earned_at?: string | null
          funded_at?: string | null
          id?: string
          note?: string | null
          paid_at?: string | null
          party_id: string
          party_kind: string
          payable_at?: string | null
          payment_reference?: string | null
          plan_id?: string | null
          rate_or_amount: number
          referral_event_id?: string | null
          reversed_at?: string | null
          state?: string
          updated_at?: string
        }
        Update: {
          basis?: string
          basis_amount?: number | null
          computed_amount?: number | null
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          earned_at?: string | null
          funded_at?: string | null
          id?: string
          note?: string | null
          paid_at?: string | null
          party_id?: string
          party_kind?: string
          payable_at?: string | null
          payment_reference?: string | null
          plan_id?: string | null
          rate_or_amount?: number
          referral_event_id?: string | null
          reversed_at?: string | null
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commissions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "funding_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_plan_fk"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "commission_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_referral_event_id_fkey"
            columns: ["referral_event_id"]
            isOneToOne: false
            referencedRelation: "referral_events"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_blocked_terms: {
        Row: {
          agency_id: string | null
          category: string
          created_at: string
          created_by: string | null
          id: string
          kind: string
          term: string
        }
        Insert: {
          agency_id?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          term: string
        }
        Update: {
          agency_id?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          term?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_blocked_terms_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_blocked_terms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      consumer_report_requests: {
        Row: {
          authorization_state: Database["public"]["Enums"]["consumer_report_authorization"]
          consent_text_version: string | null
          created_at: string
          file_id: string
          id: string
          party_id: string
          permissible_purpose_basis: string
          product_family: string
          provider: string | null
          purpose: string
          report_id: string | null
          requested_at: string
          requested_by: string | null
        }
        Insert: {
          authorization_state?: Database["public"]["Enums"]["consumer_report_authorization"]
          consent_text_version?: string | null
          created_at?: string
          file_id: string
          id?: string
          party_id: string
          permissible_purpose_basis: string
          product_family: string
          provider?: string | null
          purpose: string
          report_id?: string | null
          requested_at?: string
          requested_by?: string | null
        }
        Update: {
          authorization_state?: Database["public"]["Enums"]["consumer_report_authorization"]
          consent_text_version?: string | null
          created_at?: string
          file_id?: string
          id?: string
          party_id?: string
          permissible_purpose_basis?: string
          product_family?: string
          provider?: string | null
          purpose?: string
          report_id?: string | null
          requested_at?: string
          requested_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consumer_report_requests_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "borrower_funding_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumer_report_requests_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "funding_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumer_report_requests_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "funding_parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumer_report_requests_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "credit_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumer_report_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      credential_platforms: {
        Row: {
          key: string
          label: string
          sends_code: boolean
          sort: number
        }
        Insert: {
          key: string
          label: string
          sends_code?: boolean
          sort?: number
        }
        Update: {
          key?: string
          label?: string
          sends_code?: boolean
          sort?: number
        }
        Relationships: []
      }
      credit_reports: {
        Row: {
          bureaus: string[]
          client_id: string | null
          consumer_user_id: string | null
          created_at: string
          file_id: string | null
          fulfillment_client_id: string | null
          id: string
          import_quality: Database["public"]["Enums"]["import_quality"] | null
          imported_by: string
          organization_id: string | null
          outsourcing_group_id: string | null
          parser_version: string
          pulled_at: string
          source: string
        }
        Insert: {
          bureaus: string[]
          client_id?: string | null
          consumer_user_id?: string | null
          created_at?: string
          file_id?: string | null
          fulfillment_client_id?: string | null
          id?: string
          import_quality?: Database["public"]["Enums"]["import_quality"] | null
          imported_by: string
          organization_id?: string | null
          outsourcing_group_id?: string | null
          parser_version: string
          pulled_at: string
          source: string
        }
        Update: {
          bureaus?: string[]
          client_id?: string | null
          consumer_user_id?: string | null
          created_at?: string
          file_id?: string | null
          fulfillment_client_id?: string | null
          id?: string
          import_quality?: Database["public"]["Enums"]["import_quality"] | null
          imported_by?: string
          organization_id?: string | null
          outsourcing_group_id?: string | null
          parser_version?: string
          pulled_at?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_reports_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_reports_consumer_user_id_fkey"
            columns: ["consumer_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_reports_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_reports_fulfillment_client_id_fkey"
            columns: ["fulfillment_client_id"]
            isOneToOne: false
            referencedRelation: "fulfillment_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_reports_imported_by_fkey"
            columns: ["imported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_reports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_reports_outsourcing_group_id_fkey"
            columns: ["outsourcing_group_id"]
            isOneToOne: false
            referencedRelation: "outsourcing_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_client_requirement_blocks: {
        Row: {
          requirement_id: string
          work_item_id: string
        }
        Insert: {
          requirement_id: string
          work_item_id: string
        }
        Update: {
          requirement_id?: string
          work_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_client_requirement_blocks_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "crm_client_requirements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_client_requirement_blocks_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_attention"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_client_requirement_blocks_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_client_requirements: {
        Row: {
          created_at: string
          created_by: string | null
          detail: string | null
          id: string
          label: string
          project_id: string
          requirement_id: string | null
          satisfied_at: string | null
          satisfied_by: string | null
          satisfied_note: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          detail?: string | null
          id?: string
          label: string
          project_id: string
          requirement_id?: string | null
          satisfied_at?: string | null
          satisfied_by?: string | null
          satisfied_note?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          detail?: string | null
          id?: string
          label?: string
          project_id?: string
          requirement_id?: string | null
          satisfied_at?: string | null
          satisfied_by?: string | null
          satisfied_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_client_requirements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_client_requirements_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "crm_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_client_requirements_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "crm_requirements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_client_requirements_satisfied_by_fkey"
            columns: ["satisfied_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_engine_templates: {
        Row: {
          agency_id: string
          created_at: string
          created_by: string | null
          engine_key: string
          id: string
          notes: string | null
          provenance: string
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          agency_id: string
          created_at?: string
          created_by?: string | null
          engine_key: string
          id?: string
          notes?: string | null
          provenance?: string
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          agency_id?: string
          created_at?: string
          created_by?: string | null
          engine_key?: string
          id?: string
          notes?: string | null
          provenance?: string
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "crm_engine_templates_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_engine_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_engine_templates_engine_key_fkey"
            columns: ["engine_key"]
            isOneToOne: false
            referencedRelation: "crm_engines"
            referencedColumns: ["key"]
          },
        ]
      }
      crm_engines: {
        Row: {
          description: string | null
          key: string
          label: string
          sort: number
        }
        Insert: {
          description?: string | null
          key: string
          label: string
          sort?: number
        }
        Update: {
          description?: string | null
          key?: string
          label?: string
          sort?: number
        }
        Relationships: []
      }
      crm_milestone_templates: {
        Row: {
          agency_id: string
          client_visible: boolean
          engine_key: string | null
          id: string
          key: string
          label: string
          sort: number
          work_unit_title: string | null
        }
        Insert: {
          agency_id: string
          client_visible?: boolean
          engine_key?: string | null
          id?: string
          key: string
          label: string
          sort?: number
          work_unit_title?: string | null
        }
        Update: {
          agency_id?: string
          client_visible?: boolean
          engine_key?: string | null
          id?: string
          key?: string
          label?: string
          sort?: number
          work_unit_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_milestone_templates_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_milestone_templates_engine_key_fkey"
            columns: ["engine_key"]
            isOneToOne: false
            referencedRelation: "crm_engines"
            referencedColumns: ["key"]
          },
        ]
      }
      crm_milestones: {
        Row: {
          client_visible: boolean
          completed_at: string | null
          completed_by: string | null
          created_at: string
          engine_key: string | null
          id: string
          key: string
          label: string
          link_url: string | null
          notes: string | null
          project_id: string
          scheduled_at: string | null
          sort: number
          work_item_id: string | null
        }
        Insert: {
          client_visible?: boolean
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          engine_key?: string | null
          id?: string
          key: string
          label: string
          link_url?: string | null
          notes?: string | null
          project_id: string
          scheduled_at?: string | null
          sort?: number
          work_item_id?: string | null
        }
        Update: {
          client_visible?: boolean
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          engine_key?: string | null
          id?: string
          key?: string
          label?: string
          link_url?: string | null
          notes?: string | null
          project_id?: string
          scheduled_at?: string | null
          sort?: number
          work_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_milestones_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_milestones_engine_key_fkey"
            columns: ["engine_key"]
            isOneToOne: false
            referencedRelation: "crm_engines"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "crm_milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "crm_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_milestones_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_attention"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_milestones_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_project_engines: {
        Row: {
          added_at: string
          added_by: string | null
          cancelled_at: string | null
          cancelled_reason: string | null
          engine_key: string
          id: string
          project_id: string
          template_id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          cancelled_at?: string | null
          cancelled_reason?: string | null
          engine_key: string
          id?: string
          project_id: string
          template_id: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          cancelled_at?: string | null
          cancelled_reason?: string | null
          engine_key?: string
          id?: string
          project_id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_project_engines_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_project_engines_engine_key_fkey"
            columns: ["engine_key"]
            isOneToOne: false
            referencedRelation: "crm_engines"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "crm_project_engines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "crm_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_project_engines_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "crm_engine_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_projects: {
        Row: {
          agency_id: string
          archived_at: string | null
          archived_reason: string | null
          created_at: string
          created_by: string | null
          description: string | null
          health_override: string | null
          health_override_at: string | null
          health_override_by: string | null
          health_override_reason: string | null
          id: string
          journey_override: string | null
          journey_override_at: string | null
          journey_override_by: string | null
          journey_override_reason: string | null
          lead_id: string | null
          name: string
          organization_id: string | null
          partner_group_id: string | null
          partner_service_id: string | null
          preset: string | null
          started_on: string | null
          support_end_date: string | null
          support_start_date: string | null
          target_go_live: string | null
          team_id: string | null
          updated_at: string
          went_live_at: string | null
        }
        Insert: {
          agency_id: string
          archived_at?: string | null
          archived_reason?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          health_override?: string | null
          health_override_at?: string | null
          health_override_by?: string | null
          health_override_reason?: string | null
          id?: string
          journey_override?: string | null
          journey_override_at?: string | null
          journey_override_by?: string | null
          journey_override_reason?: string | null
          lead_id?: string | null
          name: string
          organization_id?: string | null
          partner_group_id?: string | null
          partner_service_id?: string | null
          preset?: string | null
          started_on?: string | null
          support_end_date?: string | null
          support_start_date?: string | null
          target_go_live?: string | null
          team_id?: string | null
          updated_at?: string
          went_live_at?: string | null
        }
        Update: {
          agency_id?: string
          archived_at?: string | null
          archived_reason?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          health_override?: string | null
          health_override_at?: string | null
          health_override_by?: string | null
          health_override_reason?: string | null
          id?: string
          journey_override?: string | null
          journey_override_at?: string | null
          journey_override_by?: string | null
          journey_override_reason?: string | null
          lead_id?: string | null
          name?: string
          organization_id?: string | null
          partner_group_id?: string | null
          partner_service_id?: string | null
          preset?: string | null
          started_on?: string | null
          support_end_date?: string | null
          support_start_date?: string | null
          target_go_live?: string | null
          team_id?: string | null
          updated_at?: string
          went_live_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_projects_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_projects_health_override_by_fkey"
            columns: ["health_override_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_projects_journey_override_by_fkey"
            columns: ["journey_override_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_projects_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_projects_partner_group_id_fkey"
            columns: ["partner_group_id"]
            isOneToOne: false
            referencedRelation: "outsourcing_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_projects_partner_service_id_fkey"
            columns: ["partner_service_id"]
            isOneToOne: false
            referencedRelation: "partner_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_projects_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_requirements: {
        Row: {
          agency_id: string
          classified_at: string | null
          classified_by: string | null
          detail: string | null
          engine_key: string | null
          id: string
          import_batch_id: string | null
          imported_at: string
          kind: string | null
          optional: boolean
          source_reference: string
          source_row_ref: string
          source_section: string | null
          title: string
          work_unit_template_id: string | null
        }
        Insert: {
          agency_id: string
          classified_at?: string | null
          classified_by?: string | null
          detail?: string | null
          engine_key?: string | null
          id?: string
          import_batch_id?: string | null
          imported_at?: string
          kind?: string | null
          optional?: boolean
          source_reference?: string
          source_row_ref: string
          source_section?: string | null
          title: string
          work_unit_template_id?: string | null
        }
        Update: {
          agency_id?: string
          classified_at?: string | null
          classified_by?: string | null
          detail?: string | null
          engine_key?: string | null
          id?: string
          import_batch_id?: string | null
          imported_at?: string
          kind?: string | null
          optional?: boolean
          source_reference?: string
          source_row_ref?: string
          source_section?: string | null
          title?: string
          work_unit_template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_requirements_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_requirements_classified_by_fkey"
            columns: ["classified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_requirements_engine_key_fkey"
            columns: ["engine_key"]
            isOneToOne: false
            referencedRelation: "crm_engines"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "crm_requirements_work_unit_template_id_fkey"
            columns: ["work_unit_template_id"]
            isOneToOne: false
            referencedRelation: "crm_work_unit_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_work_unit_template_actions: {
        Row: {
          created_at: string
          detail: string | null
          id: string
          kind: string
          label: string
          requirement_id: string | null
          sort: number
          work_unit_template_id: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          id?: string
          kind: string
          label: string
          requirement_id?: string | null
          sort?: number
          work_unit_template_id: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          id?: string
          kind?: string
          label?: string
          requirement_id?: string | null
          sort?: number
          work_unit_template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_work_unit_template_actions_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "crm_requirements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_work_unit_template_actions_work_unit_template_id_fkey"
            columns: ["work_unit_template_id"]
            isOneToOne: false
            referencedRelation: "crm_work_unit_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_work_unit_template_deps: {
        Row: {
          depends_on_id: string
          work_unit_template_id: string
        }
        Insert: {
          depends_on_id: string
          work_unit_template_id: string
        }
        Update: {
          depends_on_id?: string
          work_unit_template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_work_unit_template_deps_depends_on_id_fkey"
            columns: ["depends_on_id"]
            isOneToOne: false
            referencedRelation: "crm_work_unit_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_work_unit_template_deps_work_unit_template_id_fkey"
            columns: ["work_unit_template_id"]
            isOneToOne: false
            referencedRelation: "crm_work_unit_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_work_unit_templates: {
        Row: {
          created_at: string
          default_team_id: string | null
          dependency_mode: string
          description: string | null
          id: string
          phase: number | null
          requires_qa: boolean
          sort: number
          target_days: number | null
          template_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_team_id?: string | null
          dependency_mode?: string
          description?: string | null
          id?: string
          phase?: number | null
          requires_qa?: boolean
          sort?: number
          target_days?: number | null
          template_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_team_id?: string | null
          dependency_mode?: string
          description?: string | null
          id?: string
          phase?: number | null
          requires_qa?: boolean
          sort?: number
          target_days?: number | null
          template_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_work_unit_templates_default_team_id_fkey"
            columns: ["default_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_work_unit_templates_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "crm_engine_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_communications: {
        Row: {
          body: string
          channel: Database["public"]["Enums"]["deal_comm_channel"]
          contact_id: string | null
          counterparty: string | null
          created_at: string
          deal_id: string
          direction: Database["public"]["Enums"]["deal_comm_direction"]
          id: string
          occurred_at: string
          recorded_by: string | null
          subject: string | null
        }
        Insert: {
          body: string
          channel: Database["public"]["Enums"]["deal_comm_channel"]
          contact_id?: string | null
          counterparty?: string | null
          created_at?: string
          deal_id: string
          direction: Database["public"]["Enums"]["deal_comm_direction"]
          id?: string
          occurred_at?: string
          recorded_by?: string | null
          subject?: string | null
        }
        Update: {
          body?: string
          channel?: Database["public"]["Enums"]["deal_comm_channel"]
          contact_id?: string | null
          counterparty?: string | null
          created_at?: string
          deal_id?: string
          direction?: Database["public"]["Enums"]["deal_comm_direction"]
          id?: string
          occurred_at?: string
          recorded_by?: string | null
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_communications_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "lender_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_communications_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "funding_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_communications_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          agency_id: string
          archived_at: string | null
          created_at: string
          description: string | null
          division: Database["public"]["Enums"]["fulfillment_service"]
          division_id: string | null
          id: string
          is_fixture: boolean
          key: string
          manager_id: string | null
          name: string
          sort: number
        }
        Insert: {
          agency_id: string
          archived_at?: string | null
          created_at?: string
          description?: string | null
          division: Database["public"]["Enums"]["fulfillment_service"]
          division_id?: string | null
          id?: string
          is_fixture?: boolean
          key: string
          manager_id?: string | null
          name: string
          sort?: number
        }
        Update: {
          agency_id?: string
          archived_at?: string | null
          created_at?: string
          description?: string | null
          division?: Database["public"]["Enums"]["fulfillment_service"]
          division_id?: string | null
          id?: string
          is_fixture?: boolean
          key?: string
          manager_id?: string | null
          name?: string
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "departments_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dispute_attestations: {
        Row: {
          attested_at: string
          attested_by: string | null
          id: string
          letter_id: string
          statements: Json
        }
        Insert: {
          attested_at?: string
          attested_by?: string | null
          id?: string
          letter_id: string
          statements: Json
        }
        Update: {
          attested_at?: string
          attested_by?: string | null
          id?: string
          letter_id?: string
          statements?: Json
        }
        Relationships: [
          {
            foreignKeyName: "dispute_attestations_attested_by_fkey"
            columns: ["attested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_attestations_letter_id_fkey"
            columns: ["letter_id"]
            isOneToOne: true
            referencedRelation: "dispute_letters"
            referencedColumns: ["id"]
          },
        ]
      }
      dispute_item_outcomes: {
        Row: {
          account_ref: string
          bureau: string
          client_id: string
          created_at: string
          created_by: string | null
          current_value: string | null
          field: string | null
          id: string
          note: string | null
          outcome: Database["public"]["Enums"]["dispute_outcome"]
          prev_report_id: string | null
          previous_value: string | null
          report_id: string | null
          result_source: Database["public"]["Enums"]["outcome_source"]
          reviewed_at: string | null
          reviewed_by: string | null
          round_number: number | null
        }
        Insert: {
          account_ref: string
          bureau: string
          client_id: string
          created_at?: string
          created_by?: string | null
          current_value?: string | null
          field?: string | null
          id?: string
          note?: string | null
          outcome: Database["public"]["Enums"]["dispute_outcome"]
          prev_report_id?: string | null
          previous_value?: string | null
          report_id?: string | null
          result_source: Database["public"]["Enums"]["outcome_source"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          round_number?: number | null
        }
        Update: {
          account_ref?: string
          bureau?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          current_value?: string | null
          field?: string | null
          id?: string
          note?: string | null
          outcome?: Database["public"]["Enums"]["dispute_outcome"]
          prev_report_id?: string | null
          previous_value?: string | null
          report_id?: string | null
          result_source?: Database["public"]["Enums"]["outcome_source"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          round_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dispute_item_outcomes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "fulfillment_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_item_outcomes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_item_outcomes_prev_report_id_fkey"
            columns: ["prev_report_id"]
            isOneToOne: false
            referencedRelation: "credit_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_item_outcomes_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "credit_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_item_outcomes_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dispute_letters: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          body_final: string
          bureau: string | null
          client_id: string
          created_at: string
          created_by: string | null
          dispute_origin: Database["public"]["Enums"]["dispute_origin"]
          evidence_file_ids: string[]
          finding_ids: string[]
          generated_by: string
          id: string
          item_ids: string[]
          mailed_at: string | null
          qa_by: string | null
          qa_passed_at: string | null
          recipient_kind: Database["public"]["Enums"]["letter_audience"]
          recipient_name: string
          responded_at: string | null
          round_id: string
          status: Database["public"]["Enums"]["dispute_letter_status"]
          template_id: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          body_final?: string
          bureau?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          dispute_origin?: Database["public"]["Enums"]["dispute_origin"]
          evidence_file_ids?: string[]
          finding_ids?: string[]
          generated_by?: string
          id?: string
          item_ids?: string[]
          mailed_at?: string | null
          qa_by?: string | null
          qa_passed_at?: string | null
          recipient_kind: Database["public"]["Enums"]["letter_audience"]
          recipient_name: string
          responded_at?: string | null
          round_id: string
          status?: Database["public"]["Enums"]["dispute_letter_status"]
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          body_final?: string
          bureau?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          dispute_origin?: Database["public"]["Enums"]["dispute_origin"]
          evidence_file_ids?: string[]
          finding_ids?: string[]
          generated_by?: string
          id?: string
          item_ids?: string[]
          mailed_at?: string | null
          qa_by?: string | null
          qa_passed_at?: string | null
          recipient_kind?: Database["public"]["Enums"]["letter_audience"]
          recipient_name?: string
          responded_at?: string | null
          round_id?: string
          status?: Database["public"]["Enums"]["dispute_letter_status"]
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispute_letters_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_letters_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "fulfillment_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_letters_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_letters_qa_by_fkey"
            columns: ["qa_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_letters_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "dispute_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_letters_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "letter_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      dispute_reasons: {
        Row: {
          agency_id: string
          body: string
          citations: string[]
          claim_tier: Database["public"]["Enums"]["claim_tier"]
          created_at: string
          created_by: string | null
          from_round: number
          id: string
          is_active: boolean
          label: string
          organization_id: string | null
          requires: string[]
          requires_attestation: string[]
          subject: string
          tier: Database["public"]["Enums"]["escalation_tier"]
          updated_at: string
          voice: Database["public"]["Enums"]["reason_voice"]
          weight: number
        }
        Insert: {
          agency_id: string
          body: string
          citations?: string[]
          claim_tier: Database["public"]["Enums"]["claim_tier"]
          created_at?: string
          created_by?: string | null
          from_round?: number
          id?: string
          is_active?: boolean
          label: string
          organization_id?: string | null
          requires?: string[]
          requires_attestation?: string[]
          subject: string
          tier: Database["public"]["Enums"]["escalation_tier"]
          updated_at?: string
          voice?: Database["public"]["Enums"]["reason_voice"]
          weight?: number
        }
        Update: {
          agency_id?: string
          body?: string
          citations?: string[]
          claim_tier?: Database["public"]["Enums"]["claim_tier"]
          created_at?: string
          created_by?: string | null
          from_round?: number
          id?: string
          is_active?: boolean
          label?: string
          organization_id?: string | null
          requires?: string[]
          requires_attestation?: string[]
          subject?: string
          tier?: Database["public"]["Enums"]["escalation_tier"]
          updated_at?: string
          voice?: Database["public"]["Enums"]["reason_voice"]
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "dispute_reasons_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_reasons_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_reasons_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      dispute_rounds: {
        Row: {
          client_id: string
          closed_at: string | null
          created_by: string | null
          cycle_reset: boolean
          id: string
          opened_at: string
          round_number: number
          strategy: Database["public"]["Enums"]["dispute_strategy"]
        }
        Insert: {
          client_id: string
          closed_at?: string | null
          created_by?: string | null
          cycle_reset?: boolean
          id?: string
          opened_at?: string
          round_number: number
          strategy: Database["public"]["Enums"]["dispute_strategy"]
        }
        Update: {
          client_id?: string
          closed_at?: string | null
          created_by?: string | null
          cycle_reset?: boolean
          id?: string
          opened_at?: string
          round_number?: number
          strategy?: Database["public"]["Enums"]["dispute_strategy"]
        }
        Relationships: [
          {
            foreignKeyName: "dispute_rounds_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "fulfillment_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_rounds_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dispute_timers: {
        Row: {
          due_at: string
          id: string
          kind: Database["public"]["Enums"]["dispute_timer_kind"]
          letter_id: string
          note: string | null
          satisfied_at: string | null
        }
        Insert: {
          due_at: string
          id?: string
          kind: Database["public"]["Enums"]["dispute_timer_kind"]
          letter_id: string
          note?: string | null
          satisfied_at?: string | null
        }
        Update: {
          due_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["dispute_timer_kind"]
          letter_id?: string
          note?: string | null
          satisfied_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispute_timers_letter_id_fkey"
            columns: ["letter_id"]
            isOneToOne: false
            referencedRelation: "dispute_letters"
            referencedColumns: ["id"]
          },
        ]
      }
      divisions: {
        Row: {
          agency_id: string
          archived_at: string | null
          created_at: string
          description: string | null
          id: string
          is_fixture: boolean
          lead_id: string | null
          name: string
          parent_division_id: string | null
          service: Database["public"]["Enums"]["fulfillment_service"]
          sort: number
          tier: string
          updated_at: string
        }
        Insert: {
          agency_id: string
          archived_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_fixture?: boolean
          lead_id?: string | null
          name: string
          parent_division_id?: string | null
          service: Database["public"]["Enums"]["fulfillment_service"]
          sort?: number
          tier?: string
          updated_at?: string
        }
        Update: {
          agency_id?: string
          archived_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_fixture?: boolean
          lead_id?: string | null
          name?: string
          parent_division_id?: string | null
          service?: Database["public"]["Enums"]["fulfillment_service"]
          sort?: number
          tier?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "divisions_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "divisions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "divisions_parent_division_id_fkey"
            columns: ["parent_division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
        ]
      }
      diy_consents: {
        Row: {
          agreed_at: string
          agreed_ip: unknown
          client_id: string
          id: string
          kind: string
          statement: string
          version: string
          withdrawn_at: string | null
        }
        Insert: {
          agreed_at?: string
          agreed_ip?: unknown
          client_id: string
          id?: string
          kind: string
          statement: string
          version: string
          withdrawn_at?: string | null
        }
        Update: {
          agreed_at?: string
          agreed_ip?: unknown
          client_id?: string
          id?: string
          kind?: string
          statement?: string
          version?: string
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "diy_consents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      diy_journeys: {
        Row: {
          client_id: string
          identity_theft_pathway: boolean
          identity_theft_report_at: string | null
          round_number: number
          stage: Database["public"]["Enums"]["diy_stage"]
          stage_changed_at: string
          started_at: string
          updated_at: string
        }
        Insert: {
          client_id: string
          identity_theft_pathway?: boolean
          identity_theft_report_at?: string | null
          round_number?: number
          stage?: Database["public"]["Enums"]["diy_stage"]
          stage_changed_at?: string
          started_at?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          identity_theft_pathway?: boolean
          identity_theft_report_at?: string | null
          round_number?: number
          stage?: Database["public"]["Enums"]["diy_stage"]
          stage_changed_at?: string
          started_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "diy_journeys_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      document_flags: {
        Row: {
          automated_status: Database["public"]["Enums"]["automated_review_status"]
          confidence: number | null
          created_at: string
          created_by: string | null
          evidence: Json
          file_id: string
          flag_code: Database["public"]["Enums"]["document_flag_code"]
          human_disposition:
            | Database["public"]["Enums"]["flag_human_disposition"]
            | null
          id: string
          instance_id: string | null
          request_id: string | null
          reviewed_at: string | null
          reviewer: string | null
          reviewer_reason: string | null
          rule_id: string | null
          rule_version: string | null
        }
        Insert: {
          automated_status?: Database["public"]["Enums"]["automated_review_status"]
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          evidence?: Json
          file_id: string
          flag_code: Database["public"]["Enums"]["document_flag_code"]
          human_disposition?:
            | Database["public"]["Enums"]["flag_human_disposition"]
            | null
          id?: string
          instance_id?: string | null
          request_id?: string | null
          reviewed_at?: string | null
          reviewer?: string | null
          reviewer_reason?: string | null
          rule_id?: string | null
          rule_version?: string | null
        }
        Update: {
          automated_status?: Database["public"]["Enums"]["automated_review_status"]
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          evidence?: Json
          file_id?: string
          flag_code?: Database["public"]["Enums"]["document_flag_code"]
          human_disposition?:
            | Database["public"]["Enums"]["flag_human_disposition"]
            | null
          id?: string
          instance_id?: string | null
          request_id?: string | null
          reviewed_at?: string | null
          reviewer?: string | null
          reviewer_reason?: string | null
          rule_id?: string | null
          rule_version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_flags_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_flags_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "borrower_funding_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_flags_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "funding_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_flags_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "document_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_flags_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "document_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_flags_reviewer_fkey"
            columns: ["reviewer"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      document_instances: {
        Row: {
          classified_period: string | null
          classified_type: string | null
          created_at: string
          disposition: Database["public"]["Enums"]["document_disposition"]
          extraction: Json
          extraction_confidence: number | null
          extractor: string | null
          extractor_version: string | null
          file_id: string
          id: string
          mime_type: string | null
          pages: number | null
          reason: string | null
          request_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sha256: string
          shareable_with_lender: boolean
          size_bytes: number | null
          storage_file_id: string
          supersedes_id: string | null
          upload_source: string
          uploaded_by: string | null
        }
        Insert: {
          classified_period?: string | null
          classified_type?: string | null
          created_at?: string
          disposition?: Database["public"]["Enums"]["document_disposition"]
          extraction?: Json
          extraction_confidence?: number | null
          extractor?: string | null
          extractor_version?: string | null
          file_id: string
          id?: string
          mime_type?: string | null
          pages?: number | null
          reason?: string | null
          request_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sha256: string
          shareable_with_lender?: boolean
          size_bytes?: number | null
          storage_file_id: string
          supersedes_id?: string | null
          upload_source?: string
          uploaded_by?: string | null
        }
        Update: {
          classified_period?: string | null
          classified_type?: string | null
          created_at?: string
          disposition?: Database["public"]["Enums"]["document_disposition"]
          extraction?: Json
          extraction_confidence?: number | null
          extractor?: string | null
          extractor_version?: string | null
          file_id?: string
          id?: string
          mime_type?: string | null
          pages?: number | null
          reason?: string | null
          request_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sha256?: string
          shareable_with_lender?: boolean
          size_bytes?: number | null
          storage_file_id?: string
          supersedes_id?: string | null
          upload_source?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_instances_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "borrower_funding_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_instances_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "funding_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_instances_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "document_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_instances_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_instances_storage_file_id_fkey"
            columns: ["storage_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_instances_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "document_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_instances_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      document_requests: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string | null
          deal_id: string | null
          document_type: string
          file_id: string
          id: string
          lender_note: string | null
          party_id: string | null
          period: string | null
          requirement: Database["public"]["Enums"]["document_requirement"]
          rule_id: string | null
          rule_version: number | null
          satisfied_by_instance_id: string | null
          status: Database["public"]["Enums"]["document_request_status"]
          updated_at: string
          waived_at: string | null
          waived_by: string | null
          waived_reason: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          document_type: string
          file_id: string
          id?: string
          lender_note?: string | null
          party_id?: string | null
          period?: string | null
          requirement?: Database["public"]["Enums"]["document_requirement"]
          rule_id?: string | null
          rule_version?: number | null
          satisfied_by_instance_id?: string | null
          status?: Database["public"]["Enums"]["document_request_status"]
          updated_at?: string
          waived_at?: string | null
          waived_by?: string | null
          waived_reason?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          document_type?: string
          file_id?: string
          id?: string
          lender_note?: string | null
          party_id?: string | null
          period?: string | null
          requirement?: Database["public"]["Enums"]["document_requirement"]
          rule_id?: string | null
          rule_version?: number | null
          satisfied_by_instance_id?: string | null
          status?: Database["public"]["Enums"]["document_request_status"]
          updated_at?: string
          waived_at?: string | null
          waived_by?: string | null
          waived_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_requests_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_requests_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "funding_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_requests_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "borrower_funding_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_requests_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "funding_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_requests_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "funding_parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_requests_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "requirement_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_requests_satisfied_by_instance_id_fkey"
            columns: ["satisfied_by_instance_id"]
            isOneToOne: false
            referencedRelation: "document_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_requests_waived_by_fkey"
            columns: ["waived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      eod_revisions: {
        Row: {
          eod_id: string
          id: string
          previous: Json
          reason: string | null
          revised_at: string
          revised_by: string | null
        }
        Insert: {
          eod_id: string
          id?: string
          previous: Json
          reason?: string | null
          revised_at?: string
          revised_by?: string | null
        }
        Update: {
          eod_id?: string
          id?: string
          previous?: Json
          reason?: string | null
          revised_at?: string
          revised_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eod_revisions_eod_id_fkey"
            columns: ["eod_id"]
            isOneToOne: false
            referencedRelation: "eod_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eod_revisions_revised_by_fkey"
            columns: ["revised_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      eod_submissions: {
        Row: {
          additional_notes: string | null
          agency_id: string
          auto_submitted: boolean
          blockers: string | null
          created_at: string
          employee_id: string
          escalations: string | null
          id: string
          next_workday_priority: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          snapshot: Json | null
          state: Database["public"]["Enums"]["eod_state"]
          submitted_at: string | null
          submitted_by: string | null
          unfinished_work: string | null
          updated_at: string
          work_date: string
        }
        Insert: {
          additional_notes?: string | null
          agency_id: string
          auto_submitted?: boolean
          blockers?: string | null
          created_at?: string
          employee_id: string
          escalations?: string | null
          id?: string
          next_workday_priority?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          snapshot?: Json | null
          state?: Database["public"]["Enums"]["eod_state"]
          submitted_at?: string | null
          submitted_by?: string | null
          unfinished_work?: string | null
          updated_at?: string
          work_date: string
        }
        Update: {
          additional_notes?: string | null
          agency_id?: string
          auto_submitted?: boolean
          blockers?: string | null
          created_at?: string
          employee_id?: string
          escalations?: string | null
          id?: string
          next_workday_priority?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          snapshot?: Json | null
          state?: Database["public"]["Enums"]["eod_state"]
          submitted_at?: string | null
          submitted_by?: string | null
          unfinished_work?: string | null
          updated_at?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "eod_submissions_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eod_submissions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eod_submissions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eod_submissions_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      external_memberships: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["external_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role: Database["public"]["Enums"]["external_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["external_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          agency_id: string
          bucket: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          mime_type: string | null
          name: string
          organization_id: string | null
          path: string
          sha256: string | null
          shared_at: string | null
          shared_by: string | null
          shared_with_partner: boolean
          size_bytes: number | null
          uploaded_by: string | null
        }
        Insert: {
          agency_id?: string
          bucket?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          mime_type?: string | null
          name: string
          organization_id?: string | null
          path: string
          sha256?: string | null
          shared_at?: string | null
          shared_by?: string | null
          shared_with_partner?: boolean
          size_bytes?: number | null
          uploaded_by?: string | null
        }
        Update: {
          agency_id?: string
          bucket?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          mime_type?: string | null
          name?: string
          organization_id?: string | null
          path?: string
          sha256?: string | null
          shared_at?: string | null
          shared_by?: string | null
          shared_with_partner?: boolean
          size_bytes?: number | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "files_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_shared_by_fkey"
            columns: ["shared_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fulfillment_clients: {
        Row: {
          agency_id: string
          archive_reason: string | null
          archived_at: string | null
          assigned_agent_id: string | null
          auto_sync: boolean
          client_id: string
          created_at: string
          created_by: string | null
          date_of_birth: string | null
          description: string | null
          due_at: string | null
          email: string
          id: string
          is_fixture: boolean
          last_activity_at: string
          lifecycle: Database["public"]["Enums"]["client_lifecycle"]
          mode: Database["public"]["Enums"]["fulfillment_mode"]
          name: string
          next_action: string | null
          open_items: number
          organization_id: string | null
          outsourcing_group_id: string | null
          partner_scope_id: string | null
          phone: string | null
          preferred_name: string | null
          processed_on: string | null
          public_id: string
          round: Database["public"]["Enums"]["fulfillment_round"]
          status: Database["public"]["Enums"]["fulfillment_client_status"]
          team_id: string | null
          updated_at: string
        }
        Insert: {
          agency_id: string
          archive_reason?: string | null
          archived_at?: string | null
          assigned_agent_id?: string | null
          auto_sync?: boolean
          client_id: string
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          description?: string | null
          due_at?: string | null
          email: string
          id?: string
          is_fixture?: boolean
          last_activity_at?: string
          lifecycle?: Database["public"]["Enums"]["client_lifecycle"]
          mode: Database["public"]["Enums"]["fulfillment_mode"]
          name: string
          next_action?: string | null
          open_items?: number
          organization_id?: string | null
          outsourcing_group_id?: string | null
          partner_scope_id?: string | null
          phone?: string | null
          preferred_name?: string | null
          processed_on?: string | null
          public_id?: string
          round?: Database["public"]["Enums"]["fulfillment_round"]
          status?: Database["public"]["Enums"]["fulfillment_client_status"]
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          agency_id?: string
          archive_reason?: string | null
          archived_at?: string | null
          assigned_agent_id?: string | null
          auto_sync?: boolean
          client_id?: string
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          description?: string | null
          due_at?: string | null
          email?: string
          id?: string
          is_fixture?: boolean
          last_activity_at?: string
          lifecycle?: Database["public"]["Enums"]["client_lifecycle"]
          mode?: Database["public"]["Enums"]["fulfillment_mode"]
          name?: string
          next_action?: string | null
          open_items?: number
          organization_id?: string | null
          outsourcing_group_id?: string | null
          partner_scope_id?: string | null
          phone?: string | null
          preferred_name?: string | null
          processed_on?: string | null
          public_id?: string
          round?: Database["public"]["Enums"]["fulfillment_round"]
          status?: Database["public"]["Enums"]["fulfillment_client_status"]
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fulfillment_clients_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfillment_clients_assigned_agent_id_fkey"
            columns: ["assigned_agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfillment_clients_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfillment_clients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfillment_clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfillment_clients_outsourcing_group_id_fkey"
            columns: ["outsourcing_group_id"]
            isOneToOne: false
            referencedRelation: "outsourcing_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfillment_clients_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      fulfillment_engagements: {
        Row: {
          agency_id: string
          authorized_team: string | null
          authorized_team_id: string | null
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          organization_id: string | null
          outsourcing_group_id: string | null
          service: Database["public"]["Enums"]["fulfillment_service"]
          status: Database["public"]["Enums"]["engagement_status"]
          updated_at: string
        }
        Insert: {
          agency_id: string
          authorized_team?: string | null
          authorized_team_id?: string | null
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          organization_id?: string | null
          outsourcing_group_id?: string | null
          service: Database["public"]["Enums"]["fulfillment_service"]
          status?: Database["public"]["Enums"]["engagement_status"]
          updated_at?: string
        }
        Update: {
          agency_id?: string
          authorized_team?: string | null
          authorized_team_id?: string | null
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          organization_id?: string | null
          outsourcing_group_id?: string | null
          service?: Database["public"]["Enums"]["fulfillment_service"]
          status?: Database["public"]["Enums"]["engagement_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fulfillment_engagements_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfillment_engagements_authorized_team_id_fkey"
            columns: ["authorized_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfillment_engagements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfillment_engagements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfillment_engagements_outsourcing_group_id_fkey"
            columns: ["outsourcing_group_id"]
            isOneToOne: false
            referencedRelation: "outsourcing_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      funded_deals: {
        Row: {
          accepted_offer_amount: number | null
          closing_id: string | null
          confirmed_at: string
          confirmed_by: string | null
          deal_id: string
          disbursement_reference: string | null
          file_id: string
          funded_at: string
          gross_funded: number
          id: string
          lender_id: string | null
          lender_name: string
          net_funded: number
          note: string | null
          offer_id: string | null
          requested_amount: number
          revenue_amount: number | null
          revenue_confirmed_at: string | null
          revenue_confirmed_by: string | null
        }
        Insert: {
          accepted_offer_amount?: number | null
          closing_id?: string | null
          confirmed_at?: string
          confirmed_by?: string | null
          deal_id: string
          disbursement_reference?: string | null
          file_id: string
          funded_at: string
          gross_funded: number
          id?: string
          lender_id?: string | null
          lender_name: string
          net_funded: number
          note?: string | null
          offer_id?: string | null
          requested_amount: number
          revenue_amount?: number | null
          revenue_confirmed_at?: string | null
          revenue_confirmed_by?: string | null
        }
        Update: {
          accepted_offer_amount?: number | null
          closing_id?: string | null
          confirmed_at?: string
          confirmed_by?: string | null
          deal_id?: string
          disbursement_reference?: string | null
          file_id?: string
          funded_at?: string
          gross_funded?: number
          id?: string
          lender_id?: string | null
          lender_name?: string
          net_funded?: number
          note?: string | null
          offer_id?: string | null
          requested_amount?: number
          revenue_amount?: number | null
          revenue_confirmed_at?: string | null
          revenue_confirmed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "funded_deals_closing_id_fkey"
            columns: ["closing_id"]
            isOneToOne: false
            referencedRelation: "closings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funded_deals_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funded_deals_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: true
            referencedRelation: "funding_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funded_deals_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "borrower_funding_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funded_deals_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "funding_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funded_deals_lender_id_fkey"
            columns: ["lender_id"]
            isOneToOne: false
            referencedRelation: "lenders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funded_deals_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funded_deals_revenue_confirmed_by_fkey"
            columns: ["revenue_confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      funding_applications: {
        Row: {
          annual_revenue: number | null
          collateral: Json
          created_at: string
          created_by: string | null
          credit_score_stated: number | null
          entity_type: string | null
          existing_debt_monthly: number | null
          file_id: string
          id: string
          monthly_revenue: number | null
          product_family: string | null
          purpose: string | null
          requested_amount: number | null
          scenario: Json
          source: string
          state: string | null
          submitted_at: string | null
          time_in_business_months: number | null
          updated_at: string
          use_of_funds: string | null
          version: number
        }
        Insert: {
          annual_revenue?: number | null
          collateral?: Json
          created_at?: string
          created_by?: string | null
          credit_score_stated?: number | null
          entity_type?: string | null
          existing_debt_monthly?: number | null
          file_id: string
          id?: string
          monthly_revenue?: number | null
          product_family?: string | null
          purpose?: string | null
          requested_amount?: number | null
          scenario?: Json
          source?: string
          state?: string | null
          submitted_at?: string | null
          time_in_business_months?: number | null
          updated_at?: string
          use_of_funds?: string | null
          version?: number
        }
        Update: {
          annual_revenue?: number | null
          collateral?: Json
          created_at?: string
          created_by?: string | null
          credit_score_stated?: number | null
          entity_type?: string | null
          existing_debt_monthly?: number | null
          file_id?: string
          id?: string
          monthly_revenue?: number | null
          product_family?: string | null
          purpose?: string | null
          requested_amount?: number | null
          scenario?: Json
          source?: string
          state?: string | null
          submitted_at?: string | null
          time_in_business_months?: number | null
          updated_at?: string
          use_of_funds?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "funding_applications_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_applications_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "borrower_funding_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_applications_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "funding_files"
            referencedColumns: ["id"]
          },
        ]
      }
      funding_businesses: {
        Row: {
          annual_revenue: number | null
          client_id: string
          created_at: string
          dba: string | null
          ein_last4: string | null
          id: string
          industry: string | null
          legal_name: string
          time_in_business_months: number | null
        }
        Insert: {
          annual_revenue?: number | null
          client_id: string
          created_at?: string
          dba?: string | null
          ein_last4?: string | null
          id?: string
          industry?: string | null
          legal_name: string
          time_in_business_months?: number | null
        }
        Update: {
          annual_revenue?: number | null
          client_id?: string
          created_at?: string
          dba?: string | null
          ein_last4?: string | null
          id?: string
          industry?: string | null
          legal_name?: string
          time_in_business_months?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "funding_businesses_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "funding_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      funding_clients: {
        Row: {
          agency_id: string
          archive_reason: string | null
          archived_at: string | null
          assigned_agent_id: string | null
          auto_sync: boolean
          client_id: string
          created_at: string
          created_by: string | null
          due_at: string | null
          email: string
          fulfillment_client_id: string | null
          id: string
          is_fixture: boolean
          last_activity_at: string
          lifecycle: Database["public"]["Enums"]["client_lifecycle"]
          mode: Database["public"]["Enums"]["fulfillment_mode"]
          name: string
          organization_id: string | null
          outsourcing_group_id: string | null
          partner_scope_id: string | null
          phone: string | null
          portal_user_id: string | null
          provenance: Database["public"]["Enums"]["funding_provenance"]
          public_id: string
          status: Database["public"]["Enums"]["funding_client_status"]
          team_id: string | null
          updated_at: string
        }
        Insert: {
          agency_id: string
          archive_reason?: string | null
          archived_at?: string | null
          assigned_agent_id?: string | null
          auto_sync?: boolean
          client_id: string
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          email: string
          fulfillment_client_id?: string | null
          id?: string
          is_fixture?: boolean
          last_activity_at?: string
          lifecycle?: Database["public"]["Enums"]["client_lifecycle"]
          mode: Database["public"]["Enums"]["fulfillment_mode"]
          name: string
          organization_id?: string | null
          outsourcing_group_id?: string | null
          partner_scope_id?: string | null
          phone?: string | null
          portal_user_id?: string | null
          provenance?: Database["public"]["Enums"]["funding_provenance"]
          public_id?: string
          status?: Database["public"]["Enums"]["funding_client_status"]
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          agency_id?: string
          archive_reason?: string | null
          archived_at?: string | null
          assigned_agent_id?: string | null
          auto_sync?: boolean
          client_id?: string
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          email?: string
          fulfillment_client_id?: string | null
          id?: string
          is_fixture?: boolean
          last_activity_at?: string
          lifecycle?: Database["public"]["Enums"]["client_lifecycle"]
          mode?: Database["public"]["Enums"]["fulfillment_mode"]
          name?: string
          organization_id?: string | null
          outsourcing_group_id?: string | null
          partner_scope_id?: string | null
          phone?: string | null
          portal_user_id?: string | null
          provenance?: Database["public"]["Enums"]["funding_provenance"]
          public_id?: string
          status?: Database["public"]["Enums"]["funding_client_status"]
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "funding_clients_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_clients_assigned_agent_id_fkey"
            columns: ["assigned_agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_clients_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_clients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_clients_fulfillment_client_id_fkey"
            columns: ["fulfillment_client_id"]
            isOneToOne: false
            referencedRelation: "fulfillment_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_clients_outsourcing_group_id_fkey"
            columns: ["outsourcing_group_id"]
            isOneToOne: false
            referencedRelation: "outsourcing_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_clients_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_clients_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      funding_deals: {
        Row: {
          amount: number
          client_id: string
          created_at: string
          file_id: string
          fit_snapshot: Json | null
          funded_at: string | null
          id: string
          lender: string
          lender_id: string | null
          policy_version_id: string | null
          program: string | null
          program_id: string | null
          rate: string | null
          status: Database["public"]["Enums"]["funding_deal_status"]
          stips_outstanding: number
          submitted_at: string | null
          term: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          client_id: string
          created_at?: string
          file_id: string
          fit_snapshot?: Json | null
          funded_at?: string | null
          id?: string
          lender: string
          lender_id?: string | null
          policy_version_id?: string | null
          program?: string | null
          program_id?: string | null
          rate?: string | null
          status?: Database["public"]["Enums"]["funding_deal_status"]
          stips_outstanding?: number
          submitted_at?: string | null
          term?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          client_id?: string
          created_at?: string
          file_id?: string
          fit_snapshot?: Json | null
          funded_at?: string | null
          id?: string
          lender?: string
          lender_id?: string | null
          policy_version_id?: string | null
          program?: string | null
          program_id?: string | null
          rate?: string | null
          status?: Database["public"]["Enums"]["funding_deal_status"]
          stips_outstanding?: number
          submitted_at?: string | null
          term?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "funding_deals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "funding_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_deals_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "borrower_funding_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_deals_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "funding_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_deals_lender_id_fkey"
            columns: ["lender_id"]
            isOneToOne: false
            referencedRelation: "lenders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_deals_policy_version_id_fkey"
            columns: ["policy_version_id"]
            isOneToOne: false
            referencedRelation: "lender_policy_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_deals_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "lender_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      funding_department_statuses: {
        Row: {
          assignee_id: string | null
          client_id: string
          department: Database["public"]["Enums"]["funding_department"]
          file_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          client_id: string
          department: Database["public"]["Enums"]["funding_department"]
          file_id?: string | null
          status: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          client_id?: string
          department?: Database["public"]["Enums"]["funding_department"]
          file_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "funding_department_statuses_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_department_statuses_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "funding_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_department_statuses_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "borrower_funding_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_department_statuses_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "funding_files"
            referencedColumns: ["id"]
          },
        ]
      }
      funding_files: {
        Row: {
          agency_id: string
          assigned_agent_id: string | null
          business_id: string
          client_id: string
          created_at: string
          created_by: string | null
          due_at: string | null
          id: string
          last_activity_at: string
          public_id: string
          purpose: string
          referred_by_membership_id: string | null
          renews_file_id: string | null
          requested_amount: number
          secondary_status: Database["public"]["Enums"]["funding_secondary_status"]
          stage: Database["public"]["Enums"]["funding_pipeline_stage"]
          updated_at: string
          waiting_on: Database["public"]["Enums"]["funding_waiting_on"]
        }
        Insert: {
          agency_id: string
          assigned_agent_id?: string | null
          business_id: string
          client_id: string
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          id?: string
          last_activity_at?: string
          public_id?: string
          purpose: string
          referred_by_membership_id?: string | null
          renews_file_id?: string | null
          requested_amount: number
          secondary_status?: Database["public"]["Enums"]["funding_secondary_status"]
          stage?: Database["public"]["Enums"]["funding_pipeline_stage"]
          updated_at?: string
          waiting_on?: Database["public"]["Enums"]["funding_waiting_on"]
        }
        Update: {
          agency_id?: string
          assigned_agent_id?: string | null
          business_id?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          id?: string
          last_activity_at?: string
          public_id?: string
          purpose?: string
          referred_by_membership_id?: string | null
          renews_file_id?: string | null
          requested_amount?: number
          secondary_status?: Database["public"]["Enums"]["funding_secondary_status"]
          stage?: Database["public"]["Enums"]["funding_pipeline_stage"]
          updated_at?: string
          waiting_on?: Database["public"]["Enums"]["funding_waiting_on"]
        }
        Relationships: [
          {
            foreignKeyName: "funding_files_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_files_assigned_agent_id_fkey"
            columns: ["assigned_agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_files_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "funding_businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_files_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "funding_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_files_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_files_referred_by_membership_id_fkey"
            columns: ["referred_by_membership_id"]
            isOneToOne: false
            referencedRelation: "external_memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_files_renews_file_id_fkey"
            columns: ["renews_file_id"]
            isOneToOne: false
            referencedRelation: "borrower_funding_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_files_renews_file_id_fkey"
            columns: ["renews_file_id"]
            isOneToOne: false
            referencedRelation: "funding_files"
            referencedColumns: ["id"]
          },
        ]
      }
      funding_parties: {
        Row: {
          business_id: string | null
          client_id: string
          created_at: string
          created_by: string | null
          details: Json
          display_name: string
          id: string
          kind: Database["public"]["Enums"]["funding_party_kind"]
          ownership_pct: number | null
        }
        Insert: {
          business_id?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          details?: Json
          display_name: string
          id?: string
          kind: Database["public"]["Enums"]["funding_party_kind"]
          ownership_pct?: number | null
        }
        Update: {
          business_id?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          details?: Json
          display_name?: string
          id?: string
          kind?: Database["public"]["Enums"]["funding_party_kind"]
          ownership_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "funding_parties_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "funding_businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_parties_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "funding_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_parties_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ghl_agency_credentials: {
        Row: {
          access_token: string
          agency_id: string
          company_id: string
          connected_by: string | null
          created_at: string
          expires_at: string | null
          refresh_token: string | null
          rotated_at: string
          token_kind: string
          updated_at: string
          webhook_secret: string | null
        }
        Insert: {
          access_token: string
          agency_id: string
          company_id: string
          connected_by?: string | null
          created_at?: string
          expires_at?: string | null
          refresh_token?: string | null
          rotated_at?: string
          token_kind?: string
          updated_at?: string
          webhook_secret?: string | null
        }
        Update: {
          access_token?: string
          agency_id?: string
          company_id?: string
          connected_by?: string | null
          created_at?: string
          expires_at?: string | null
          refresh_token?: string | null
          rotated_at?: string
          token_kind?: string
          updated_at?: string
          webhook_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ghl_agency_credentials_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: true
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ghl_agency_credentials_connected_by_fkey"
            columns: ["connected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ghl_connections: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string | null
          discovered_at: string | null
          id: string
          label: string | null
          last_event_at: string | null
          location_id: string
          name: string | null
          organization_id: string | null
          status: Database["public"]["Enums"]["ghl_connection_status"]
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          discovered_at?: string | null
          id?: string
          label?: string | null
          last_event_at?: string | null
          location_id: string
          name?: string | null
          organization_id?: string | null
          status?: Database["public"]["Enums"]["ghl_connection_status"]
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          discovered_at?: string | null
          id?: string
          label?: string | null
          last_event_at?: string | null
          location_id?: string
          name?: string | null
          organization_id?: string | null
          status?: Database["public"]["Enums"]["ghl_connection_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ghl_connections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ghl_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ghl_credentials: {
        Row: {
          access_token: string
          location_id: string
          rotated_at: string
          webhook_secret: string | null
        }
        Insert: {
          access_token: string
          location_id: string
          rotated_at?: string
          webhook_secret?: string | null
        }
        Update: {
          access_token?: string
          location_id?: string
          rotated_at?: string
          webhook_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ghl_credentials_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: true
            referencedRelation: "ghl_connections"
            referencedColumns: ["location_id"]
          },
        ]
      }
      ghl_events: {
        Row: {
          event_type: string
          external_id: string | null
          id: number
          location_id: string
          organization_id: string | null
          outcome: string | null
          payload: Json
          processed_at: string | null
          received_at: string
        }
        Insert: {
          event_type: string
          external_id?: string | null
          id?: never
          location_id: string
          organization_id?: string | null
          outcome?: string | null
          payload: Json
          processed_at?: string | null
          received_at?: string
        }
        Update: {
          event_type?: string
          external_id?: string | null
          id?: never
          location_id?: string
          organization_id?: string | null
          outcome?: string | null
          payload?: Json
          processed_at?: string | null
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ghl_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hub_modules: {
        Row: {
          always_on: boolean
          backed_by: string
          description: string
          key: string
          label: string
          package: Database["public"]["Enums"]["product_key"]
          sort: number
          status: Database["public"]["Enums"]["hub_module_status"]
        }
        Insert: {
          always_on?: boolean
          backed_by: string
          description: string
          key: string
          label: string
          package: Database["public"]["Enums"]["product_key"]
          sort?: number
          status?: Database["public"]["Enums"]["hub_module_status"]
        }
        Update: {
          always_on?: boolean
          backed_by?: string
          description?: string
          key?: string
          label?: string
          package?: Database["public"]["Enums"]["product_key"]
          sort?: number
          status?: Database["public"]["Enums"]["hub_module_status"]
        }
        Relationships: []
      }
      invitations: {
        Row: {
          accepted_at: string | null
          agency_id: string | null
          agency_role: Database["public"]["Enums"]["agency_role"] | null
          created_at: string
          email: string
          expires_at: string
          external_role: Database["public"]["Enums"]["external_role"] | null
          id: string
          invited_by: string | null
          kind: Database["public"]["Enums"]["membership_kind"]
          org_role: Database["public"]["Enums"]["org_role"] | null
          organization_id: string | null
          partner_contact_id: string | null
          partner_group_id: string | null
          token: string
        }
        Insert: {
          accepted_at?: string | null
          agency_id?: string | null
          agency_role?: Database["public"]["Enums"]["agency_role"] | null
          created_at?: string
          email: string
          expires_at?: string
          external_role?: Database["public"]["Enums"]["external_role"] | null
          id?: string
          invited_by?: string | null
          kind: Database["public"]["Enums"]["membership_kind"]
          org_role?: Database["public"]["Enums"]["org_role"] | null
          organization_id?: string | null
          partner_contact_id?: string | null
          partner_group_id?: string | null
          token?: string
        }
        Update: {
          accepted_at?: string | null
          agency_id?: string | null
          agency_role?: Database["public"]["Enums"]["agency_role"] | null
          created_at?: string
          email?: string
          expires_at?: string
          external_role?: Database["public"]["Enums"]["external_role"] | null
          id?: string
          invited_by?: string | null
          kind?: Database["public"]["Enums"]["membership_kind"]
          org_role?: Database["public"]["Enums"]["org_role"] | null
          organization_id?: string | null
          partner_contact_id?: string | null
          partner_group_id?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_partner_contact_id_fkey"
            columns: ["partner_contact_id"]
            isOneToOne: false
            referencedRelation: "partner_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_partner_group_id_fkey"
            columns: ["partner_group_id"]
            isOneToOne: false
            referencedRelation: "outsourcing_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_articles: {
        Row: {
          archived_at: string | null
          audience: Database["public"]["Enums"]["knowledge_audience"]
          body: string
          category: string | null
          created_at: string
          created_by: string | null
          id: string
          organization_id: string | null
          published_at: string | null
          sort: number
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          audience?: Database["public"]["Enums"]["knowledge_audience"]
          body: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string | null
          published_at?: string | null
          sort?: number
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          audience?: Database["public"]["Enums"]["knowledge_audience"]
          body?: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string | null
          published_at?: string | null
          sort?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_articles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_articles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_definitions: {
        Row: {
          aggregation: string
          bes_internal: boolean
          description: string | null
          key: string
          label: string
          match: Json
          service: string
          sort: number
          source: string
        }
        Insert: {
          aggregation: string
          bes_internal?: boolean
          description?: string | null
          key: string
          label: string
          match?: Json
          service: string
          sort?: number
          source: string
        }
        Update: {
          aggregation?: string
          bes_internal?: boolean
          description?: string | null
          key?: string
          label?: string
          match?: Json
          service?: string
          sort?: number
          source?: string
        }
        Relationships: []
      }
      lender_contacts: {
        Row: {
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          lender_id: string
          name: string
          notes: string | null
          phone: string | null
          role: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          lender_id: string
          name: string
          notes?: string | null
          phone?: string | null
          role?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          lender_id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          role?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lender_contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lender_contacts_lender_id_fkey"
            columns: ["lender_id"]
            isOneToOne: false
            referencedRelation: "lenders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lender_contacts_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lender_decisions: {
        Row: {
          conditions: string | null
          created_at: string
          deal_id: string
          decided_at: string
          decision: Database["public"]["Enums"]["lender_decision_kind"]
          id: string
          note: string | null
          reason_category:
            | Database["public"]["Enums"]["decline_reason_category"]
            | null
          reason_verbatim: string | null
          recorded_by: string | null
          source: string
          terms: Json
        }
        Insert: {
          conditions?: string | null
          created_at?: string
          deal_id: string
          decided_at?: string
          decision: Database["public"]["Enums"]["lender_decision_kind"]
          id?: string
          note?: string | null
          reason_category?:
            | Database["public"]["Enums"]["decline_reason_category"]
            | null
          reason_verbatim?: string | null
          recorded_by?: string | null
          source?: string
          terms?: Json
        }
        Update: {
          conditions?: string | null
          created_at?: string
          deal_id?: string
          decided_at?: string
          decision?: Database["public"]["Enums"]["lender_decision_kind"]
          id?: string
          note?: string | null
          reason_category?:
            | Database["public"]["Enums"]["decline_reason_category"]
            | null
          reason_verbatim?: string | null
          recorded_by?: string | null
          source?: string
          terms?: Json
        }
        Relationships: [
          {
            foreignKeyName: "lender_decisions_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "funding_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lender_decisions_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lender_file_shares: {
        Row: {
          file_id: string
          id: string
          lender_id: string
          revoked_at: string | null
          shared_at: string
          shared_by: string | null
        }
        Insert: {
          file_id: string
          id?: string
          lender_id: string
          revoked_at?: string | null
          shared_at?: string
          shared_by?: string | null
        }
        Update: {
          file_id?: string
          id?: string
          lender_id?: string
          revoked_at?: string | null
          shared_at?: string
          shared_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lender_file_shares_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "borrower_funding_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lender_file_shares_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "funding_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lender_file_shares_lender_id_fkey"
            columns: ["lender_id"]
            isOneToOne: false
            referencedRelation: "lenders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lender_file_shares_shared_by_fkey"
            columns: ["shared_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lender_policy_versions: {
        Row: {
          created_at: string
          created_by: string | null
          criteria: Json
          effective_from: string
          effective_until: string | null
          id: string
          last_verified_at: string | null
          program_id: string
          source_published_date: string | null
          source_reference: string | null
          source_type: string
          verified_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          criteria?: Json
          effective_from: string
          effective_until?: string | null
          id?: string
          last_verified_at?: string | null
          program_id: string
          source_published_date?: string | null
          source_reference?: string | null
          source_type: string
          verified_by?: string | null
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          criteria?: Json
          effective_from?: string
          effective_until?: string | null
          id?: string
          last_verified_at?: string | null
          program_id?: string
          source_published_date?: string | null
          source_reference?: string | null
          source_type?: string
          verified_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "lender_policy_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lender_policy_versions_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "lender_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lender_policy_versions_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lender_programs: {
        Row: {
          active: boolean
          created_at: string
          id: string
          lender_id: string
          name: string
          product_family: string
          product_subtype: string | null
          states_allowed: string[]
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          lender_id: string
          name: string
          product_family: string
          product_subtype?: string | null
          states_allowed?: string[]
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          lender_id?: string
          name?: string
          product_family?: string
          product_subtype?: string | null
          states_allowed?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "lender_programs_lender_id_fkey"
            columns: ["lender_id"]
            isOneToOne: false
            referencedRelation: "lenders"
            referencedColumns: ["id"]
          },
        ]
      }
      lender_users: {
        Row: {
          created_at: string
          lender_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          lender_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          lender_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lender_users_lender_id_fkey"
            columns: ["lender_id"]
            isOneToOne: false
            referencedRelation: "lenders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lender_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lenders: {
        Row: {
          active: boolean
          agency_id: string
          created_at: string
          created_by: string | null
          fdic_certificate: string | null
          id: string
          last_contact_at: string | null
          last_registry_check: string | null
          lender_kind: string
          name: string
          ncua_charter: string | null
          nmls_id: string | null
          notes: string | null
          official_domain: string | null
          organization_id: string | null
          partner_status: string
          public_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          agency_id: string
          created_at?: string
          created_by?: string | null
          fdic_certificate?: string | null
          id?: string
          last_contact_at?: string | null
          last_registry_check?: string | null
          lender_kind?: string
          name: string
          ncua_charter?: string | null
          nmls_id?: string | null
          notes?: string | null
          official_domain?: string | null
          organization_id?: string | null
          partner_status?: string
          public_id?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          agency_id?: string
          created_at?: string
          created_by?: string | null
          fdic_certificate?: string | null
          id?: string
          last_contact_at?: string | null
          last_registry_check?: string | null
          lender_kind?: string
          name?: string
          ncua_charter?: string | null
          nmls_id?: string | null
          notes?: string | null
          official_domain?: string | null
          organization_id?: string | null
          partner_status?: string
          public_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lenders_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lenders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lenders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      letter_mailings: {
        Row: {
          cost_cents: number | null
          error: string | null
          expected_delivery_date: string | null
          from_city: string
          from_line1: string
          from_line2: string | null
          from_name: string
          from_state: string
          from_zip: string
          id: string
          last_event_at: string | null
          letter_id: string
          provider: string
          provider_id: string | null
          provider_mode: string
          requested_at: string
          requested_by: string | null
          status: Database["public"]["Enums"]["mailing_status"]
          submitted_at: string | null
          to_city: string
          to_line1: string
          to_line2: string | null
          to_name: string
          to_state: string
          to_zip: string
          tracking_number: string | null
          updated_at: string
        }
        Insert: {
          cost_cents?: number | null
          error?: string | null
          expected_delivery_date?: string | null
          from_city: string
          from_line1: string
          from_line2?: string | null
          from_name: string
          from_state: string
          from_zip: string
          id?: string
          last_event_at?: string | null
          letter_id: string
          provider?: string
          provider_id?: string | null
          provider_mode?: string
          requested_at?: string
          requested_by?: string | null
          status?: Database["public"]["Enums"]["mailing_status"]
          submitted_at?: string | null
          to_city: string
          to_line1: string
          to_line2?: string | null
          to_name: string
          to_state: string
          to_zip: string
          tracking_number?: string | null
          updated_at?: string
        }
        Update: {
          cost_cents?: number | null
          error?: string | null
          expected_delivery_date?: string | null
          from_city?: string
          from_line1?: string
          from_line2?: string | null
          from_name?: string
          from_state?: string
          from_zip?: string
          id?: string
          last_event_at?: string | null
          letter_id?: string
          provider?: string
          provider_id?: string | null
          provider_mode?: string
          requested_at?: string
          requested_by?: string | null
          status?: Database["public"]["Enums"]["mailing_status"]
          submitted_at?: string | null
          to_city?: string
          to_line1?: string
          to_line2?: string | null
          to_name?: string
          to_state?: string
          to_zip?: string
          tracking_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "letter_mailings_letter_id_fkey"
            columns: ["letter_id"]
            isOneToOne: false
            referencedRelation: "dispute_letters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "letter_mailings_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      letter_standing_blocks: {
        Row: {
          agency_id: string
          body: string
          id: string
          is_active: boolean
          key: string
          label: string
          organization_id: string | null
          updated_at: string
        }
        Insert: {
          agency_id: string
          body: string
          id?: string
          is_active?: boolean
          key: string
          label: string
          organization_id?: string | null
          updated_at?: string
        }
        Update: {
          agency_id?: string
          body?: string
          id?: string
          is_active?: boolean
          key?: string
          label?: string
          organization_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "letter_standing_blocks_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "letter_standing_blocks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      letter_templates: {
        Row: {
          agency_id: string
          audience: Database["public"]["Enums"]["letter_audience"]
          body: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["letter_kind"]
          name: string
          organization_id: string | null
          placeholders: string[]
          supersedes_id: string | null
          version: number
        }
        Insert: {
          agency_id: string
          audience: Database["public"]["Enums"]["letter_audience"]
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          kind: Database["public"]["Enums"]["letter_kind"]
          name: string
          organization_id?: string | null
          placeholders?: string[]
          supersedes_id?: string | null
          version?: number
        }
        Update: {
          agency_id?: string
          audience?: Database["public"]["Enums"]["letter_audience"]
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["letter_kind"]
          name?: string
          organization_id?: string | null
          placeholders?: string[]
          supersedes_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "letter_templates_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "letter_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "letter_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "letter_templates_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "letter_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          agency_id: string
          channel_id: string | null
          created_at: string
          created_by: string | null
          duration_minutes: number | null
          external_event_id: string | null
          external_meeting_id: string | null
          id: string
          join_url: string | null
          provider: Database["public"]["Enums"]["meeting_provider"]
          start_at: string | null
          status: string
          topic: string
          updated_at: string
        }
        Insert: {
          agency_id: string
          channel_id?: string | null
          created_at?: string
          created_by?: string | null
          duration_minutes?: number | null
          external_event_id?: string | null
          external_meeting_id?: string | null
          id?: string
          join_url?: string | null
          provider: Database["public"]["Enums"]["meeting_provider"]
          start_at?: string | null
          status?: string
          topic: string
          updated_at?: string
        }
        Update: {
          agency_id?: string
          channel_id?: string | null
          created_at?: string
          created_by?: string | null
          duration_minutes?: number | null
          external_event_id?: string | null
          external_meeting_id?: string | null
          id?: string
          join_url?: string | null
          provider?: Database["public"]["Enums"]["meeting_provider"]
          start_at?: string | null
          status?: string
          topic?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      member_permissions: {
        Row: {
          allowed: boolean
          key: string
          membership_id: string
          reason: string | null
          set_at: string
          set_by: string | null
        }
        Insert: {
          allowed: boolean
          key: string
          membership_id: string
          reason?: string | null
          set_at?: string
          set_by?: string | null
        }
        Update: {
          allowed?: boolean
          key?: string
          membership_id?: string
          reason?: string | null
          set_at?: string
          set_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_permissions_key_fkey"
            columns: ["key"]
            isOneToOne: false
            referencedRelation: "permission_keys"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "member_permissions_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "org_memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_permissions_set_by_fkey"
            columns: ["set_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_pins: {
        Row: {
          channel_id: string
          message_id: number
          pinned_at: string
          pinned_by: string | null
        }
        Insert: {
          channel_id: string
          message_id: number
          pinned_at?: string
          pinned_by?: string | null
        }
        Update: {
          channel_id?: string
          message_id?: number
          pinned_at?: string
          pinned_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_pins_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_pins_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: true
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_pins_pinned_by_fkey"
            columns: ["pinned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          message_id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          message_id: number
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          message_id?: number
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_revisions: {
        Row: {
          body_text: string
          edited_at: string
          edited_by: string | null
          id: number
          message_id: number
        }
        Insert: {
          body_text: string
          edited_at?: string
          edited_by?: string | null
          id?: never
          message_id: number
        }
        Update: {
          body_text?: string
          edited_at?: string
          edited_by?: string | null
          id?: never
          message_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "message_revisions_edited_by_fkey"
            columns: ["edited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_revisions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          announcement_id: string | null
          author_id: string
          author_is_bes: boolean
          body: Json
          body_text: string
          channel_id: string
          client_message_id: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          edited_at: string | null
          id: number
          meeting_id: string | null
          message_type: string
          parent_message_id: number | null
          reply_to_id: number | null
        }
        Insert: {
          announcement_id?: string | null
          author_id: string
          author_is_bes?: boolean
          body: Json
          body_text: string
          channel_id: string
          client_message_id?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          edited_at?: string | null
          id?: never
          meeting_id?: string | null
          message_type?: string
          parent_message_id?: number | null
          reply_to_id?: number | null
        }
        Update: {
          announcement_id?: string | null
          author_id?: string
          author_is_bes?: boolean
          body?: Json
          body_text?: string
          channel_id?: string
          client_message_id?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          edited_at?: string | null
          id?: never
          meeting_id?: string | null
          message_type?: string
          parent_message_id?: number | null
          reply_to_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
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
            foreignKeyName: "messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          activity_id: number | null
          actor_id: string | null
          agency_id: string
          created_at: string
          detail: string | null
          entity_id: string
          entity_label: string | null
          entity_type: string
          id: number
          kind: string
          organization_id: string | null
          read_at: string | null
          recipient_id: string
          title: string
          visibility: Database["public"]["Enums"]["activity_visibility"]
        }
        Insert: {
          activity_id?: number | null
          actor_id?: string | null
          agency_id: string
          created_at?: string
          detail?: string | null
          entity_id: string
          entity_label?: string | null
          entity_type: string
          id?: never
          kind: string
          organization_id?: string | null
          read_at?: string | null
          recipient_id: string
          title: string
          visibility: Database["public"]["Enums"]["activity_visibility"]
        }
        Update: {
          activity_id?: number | null
          actor_id?: string | null
          agency_id?: string
          created_at?: string
          detail?: string | null
          entity_id?: string
          entity_label?: string | null
          entity_type?: string
          id?: never
          kind?: string
          organization_id?: string | null
          read_at?: string | null
          recipient_id?: string
          title?: string
          visibility?: Database["public"]["Enums"]["activity_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "notifications_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activity_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          client_decided_at: string | null
          created_at: string
          created_by: string | null
          deal_id: string
          expires_at: string | null
          file_id: string
          id: string
          lender_id: string | null
          note: string | null
          offer_amount: number | null
          origination_fee: number | null
          other_fees: Json
          payment_amount: number | null
          payment_frequency: string | null
          prepayment_terms: string | null
          presented_at: string | null
          presented_by: string | null
          pricing_type: Database["public"]["Enums"]["pricing_type"]
          pricing_value: number | null
          received_at: string
          status: Database["public"]["Enums"]["offer_status"]
          term_text: string | null
          updated_at: string
        }
        Insert: {
          client_decided_at?: string | null
          created_at?: string
          created_by?: string | null
          deal_id: string
          expires_at?: string | null
          file_id: string
          id?: string
          lender_id?: string | null
          note?: string | null
          offer_amount?: number | null
          origination_fee?: number | null
          other_fees?: Json
          payment_amount?: number | null
          payment_frequency?: string | null
          prepayment_terms?: string | null
          presented_at?: string | null
          presented_by?: string | null
          pricing_type?: Database["public"]["Enums"]["pricing_type"]
          pricing_value?: number | null
          received_at?: string
          status?: Database["public"]["Enums"]["offer_status"]
          term_text?: string | null
          updated_at?: string
        }
        Update: {
          client_decided_at?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string
          expires_at?: string | null
          file_id?: string
          id?: string
          lender_id?: string | null
          note?: string | null
          offer_amount?: number | null
          origination_fee?: number | null
          other_fees?: Json
          payment_amount?: number | null
          payment_frequency?: string | null
          prepayment_terms?: string | null
          presented_at?: string | null
          presented_by?: string | null
          pricing_type?: Database["public"]["Enums"]["pricing_type"]
          pricing_value?: number | null
          received_at?: string
          status?: Database["public"]["Enums"]["offer_status"]
          term_text?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "funding_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "borrower_funding_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "funding_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_lender_id_fkey"
            columns: ["lender_id"]
            isOneToOne: false
            referencedRelation: "lenders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_presented_by_fkey"
            columns: ["presented_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      org_memberships: {
        Row: {
          archived_at: string | null
          assigned_only: boolean
          created_at: string
          id: string
          job_title: string | null
          organization_department_id: string | null
          organization_id: string
          product: Database["public"]["Enums"]["product_key"] | null
          role: Database["public"]["Enums"]["org_role"]
          team_scope: string | null
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          assigned_only?: boolean
          created_at?: string
          id?: string
          job_title?: string | null
          organization_department_id?: string | null
          organization_id: string
          product?: Database["public"]["Enums"]["product_key"] | null
          role: Database["public"]["Enums"]["org_role"]
          team_scope?: string | null
          user_id: string
        }
        Update: {
          archived_at?: string | null
          assigned_only?: boolean
          created_at?: string
          id?: string
          job_title?: string | null
          organization_department_id?: string | null
          organization_id?: string
          product?: Database["public"]["Enums"]["product_key"] | null
          role?: Database["public"]["Enums"]["org_role"]
          team_scope?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_memberships_organization_department_id_fkey"
            columns: ["organization_department_id"]
            isOneToOne: false
            referencedRelation: "organization_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_automations: {
        Row: {
          config: Json
          enabled: boolean
          key: string
          organization_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          config?: Json
          enabled?: boolean
          key: string
          organization_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          config?: Json
          enabled?: boolean
          key?: string
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_automations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_automations_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_departments: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          lead_user_id: string | null
          name: string
          organization_id: string
          sort: number
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          lead_user_id?: string | null
          name: string
          organization_id: string
          sort?: number
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          lead_user_id?: string | null
          name?: string
          organization_id?: string
          sort?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_departments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_departments_lead_user_id_fkey"
            columns: ["lead_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_departments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_hub_modules: {
        Row: {
          enabled: boolean
          module_key: string
          organization_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled?: boolean
          module_key: string
          organization_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          module_key?: string
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_hub_modules_module_key_fkey"
            columns: ["module_key"]
            isOneToOne: false
            referencedRelation: "hub_modules"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "organization_hub_modules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_hub_modules_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_hub_tools: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          label: string
          note: string | null
          organization_id: string
          sort: number
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          note?: string | null
          organization_id: string
          sort?: number
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          note?: string | null
          organization_id?: string
          sort?: number
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_hub_tools_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_hub_tools_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_identity: {
        Row: {
          created_at: string
          kind: Database["public"]["Enums"]["identity_kind"]
          organization_id: string
          value: string
        }
        Insert: {
          created_at?: string
          kind: Database["public"]["Enums"]["identity_kind"]
          organization_id: string
          value: string
        }
        Update: {
          created_at?: string
          kind?: Database["public"]["Enums"]["identity_kind"]
          organization_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_identity_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_kpi_settings: {
        Row: {
          enabled: boolean
          kpi_key: string
          organization_id: string
          sort: number
          target: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled?: boolean
          kpi_key: string
          organization_id: string
          sort?: number
          target?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          kpi_key?: string
          organization_id?: string
          sort?: number
          target?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_kpi_settings_kpi_key_fkey"
            columns: ["kpi_key"]
            isOneToOne: false
            referencedRelation: "kpi_definitions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "organization_kpi_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_kpi_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_role_access: {
        Row: {
          can_access_management: boolean
          can_edit_progress: boolean
          can_log_work: boolean
          departments: string[]
          organization_id: string
          product: Database["public"]["Enums"]["product_key"]
          role: Database["public"]["Enums"]["org_role"]
          updated_at: string
          updated_by: string | null
          views: string[]
        }
        Insert: {
          can_access_management?: boolean
          can_edit_progress?: boolean
          can_log_work?: boolean
          departments?: string[]
          organization_id: string
          product: Database["public"]["Enums"]["product_key"]
          role: Database["public"]["Enums"]["org_role"]
          updated_at?: string
          updated_by?: string | null
          views?: string[]
        }
        Update: {
          can_access_management?: boolean
          can_edit_progress?: boolean
          can_log_work?: boolean
          departments?: string[]
          organization_id?: string
          product?: Database["public"]["Enums"]["product_key"]
          role?: Database["public"]["Enums"]["org_role"]
          updated_at?: string
          updated_by?: string | null
          views?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "organization_role_access_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_role_access_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          cancelled_at: string | null
          created_at: string
          created_by: string | null
          current_period_end: string | null
          current_period_start: string
          customer_profile_id: string | null
          id: string
          interval: string
          organization_id: string
          plan_key: string
          price_cents: number
          seats: number
          status: Database["public"]["Enums"]["subscription_status"]
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          current_period_end?: string | null
          current_period_start?: string
          customer_profile_id?: string | null
          id?: string
          interval?: string
          organization_id: string
          plan_key: string
          price_cents: number
          seats?: number
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          current_period_end?: string | null
          current_period_start?: string
          customer_profile_id?: string | null
          id?: string
          interval?: string
          organization_id?: string
          plan_key?: string
          price_cents?: number
          seats?: number
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_subscriptions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_subscriptions_plan_key_fkey"
            columns: ["plan_key"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["key"]
          },
        ]
      }
      organization_trials: {
        Row: {
          blocked_reason: string | null
          created_at: string
          ends_at: string
          organization_id: string
          plan_key: string
          review_note: string | null
          selected_product: Database["public"]["Enums"]["product_key"] | null
          started_at: string
          status: Database["public"]["Enums"]["trial_status"]
          updated_at: string
        }
        Insert: {
          blocked_reason?: string | null
          created_at?: string
          ends_at: string
          organization_id: string
          plan_key: string
          review_note?: string | null
          selected_product?: Database["public"]["Enums"]["product_key"] | null
          started_at?: string
          status?: Database["public"]["Enums"]["trial_status"]
          updated_at?: string
        }
        Update: {
          blocked_reason?: string | null
          created_at?: string
          ends_at?: string
          organization_id?: string
          plan_key?: string
          review_note?: string | null
          selected_product?: Database["public"]["Enums"]["product_key"] | null
          started_at?: string
          status?: Database["public"]["Enums"]["trial_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_trials_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_trials_plan_key_fkey"
            columns: ["plan_key"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["key"]
          },
        ]
      }
      organizations: {
        Row: {
          address: string | null
          agency_id: string
          branding: Json
          code: string
          created_at: string
          id: string
          is_fixture: boolean
          is_fulfillment_subscriber: boolean
          joined_at: string
          name: string
          owner_user_id: string | null
          principal_email: string
          principal_name: string
          public_id: string
          status: Database["public"]["Enums"]["org_status"]
          updated_at: string
          welcome_email_sent_at: string | null
          workspace_views: Json
        }
        Insert: {
          address?: string | null
          agency_id: string
          branding?: Json
          code: string
          created_at?: string
          id?: string
          is_fixture?: boolean
          is_fulfillment_subscriber?: boolean
          joined_at?: string
          name: string
          owner_user_id?: string | null
          principal_email: string
          principal_name: string
          public_id?: string
          status?: Database["public"]["Enums"]["org_status"]
          updated_at?: string
          welcome_email_sent_at?: string | null
          workspace_views?: Json
        }
        Update: {
          address?: string | null
          agency_id?: string
          branding?: Json
          code?: string
          created_at?: string
          id?: string
          is_fixture?: boolean
          is_fulfillment_subscriber?: boolean
          joined_at?: string
          name?: string
          owner_user_id?: string | null
          principal_email?: string
          principal_name?: string
          public_id?: string
          status?: Database["public"]["Enums"]["org_status"]
          updated_at?: string
          welcome_email_sent_at?: string | null
          workspace_views?: Json
        }
        Relationships: [
          {
            foreignKeyName: "organizations_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizations_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      outsourcing_groups: {
        Row: {
          account_manager_id: string | null
          address: string | null
          agency_id: string
          archived_at: string | null
          contact_email: string
          contract_ref: string | null
          created_at: string
          created_by: string | null
          credential_migration_required: boolean
          credential_note: string | null
          ended_on: string | null
          health: Database["public"]["Enums"]["partner_health"] | null
          health_changed_at: string | null
          health_changed_by: string | null
          health_note: string | null
          id: string
          import_batch_id: string | null
          imported_at: string | null
          is_fixture: boolean
          legacy_reported_active_clients: number | null
          legacy_reported_client_volume: string | null
          lifecycle: Database["public"]["Enums"]["partner_lifecycle"]
          name: string
          notes: string | null
          partner_name: string | null
          phone: string | null
          primary_contact: string | null
          primary_contact_id: string | null
          saas_plan: string | null
          service: string | null
          source_reference: string | null
          source_row_ref: string | null
          source_type: string
          started_on: string | null
          status: Database["public"]["Enums"]["outsourcing_group_status"]
          team_id: string | null
          updated_at: string
        }
        Insert: {
          account_manager_id?: string | null
          address?: string | null
          agency_id: string
          archived_at?: string | null
          contact_email: string
          contract_ref?: string | null
          created_at?: string
          created_by?: string | null
          credential_migration_required?: boolean
          credential_note?: string | null
          ended_on?: string | null
          health?: Database["public"]["Enums"]["partner_health"] | null
          health_changed_at?: string | null
          health_changed_by?: string | null
          health_note?: string | null
          id?: string
          import_batch_id?: string | null
          imported_at?: string | null
          is_fixture?: boolean
          legacy_reported_active_clients?: number | null
          legacy_reported_client_volume?: string | null
          lifecycle?: Database["public"]["Enums"]["partner_lifecycle"]
          name: string
          notes?: string | null
          partner_name?: string | null
          phone?: string | null
          primary_contact?: string | null
          primary_contact_id?: string | null
          saas_plan?: string | null
          service?: string | null
          source_reference?: string | null
          source_row_ref?: string | null
          source_type?: string
          started_on?: string | null
          status?: Database["public"]["Enums"]["outsourcing_group_status"]
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          account_manager_id?: string | null
          address?: string | null
          agency_id?: string
          archived_at?: string | null
          contact_email?: string
          contract_ref?: string | null
          created_at?: string
          created_by?: string | null
          credential_migration_required?: boolean
          credential_note?: string | null
          ended_on?: string | null
          health?: Database["public"]["Enums"]["partner_health"] | null
          health_changed_at?: string | null
          health_changed_by?: string | null
          health_note?: string | null
          id?: string
          import_batch_id?: string | null
          imported_at?: string | null
          is_fixture?: boolean
          legacy_reported_active_clients?: number | null
          legacy_reported_client_volume?: string | null
          lifecycle?: Database["public"]["Enums"]["partner_lifecycle"]
          name?: string
          notes?: string | null
          partner_name?: string | null
          phone?: string | null
          primary_contact?: string | null
          primary_contact_id?: string | null
          saas_plan?: string | null
          service?: string | null
          source_reference?: string | null
          source_row_ref?: string | null
          source_type?: string
          started_on?: string | null
          status?: Database["public"]["Enums"]["outsourcing_group_status"]
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outsourcing_groups_account_manager_id_fkey"
            columns: ["account_manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outsourcing_groups_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outsourcing_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outsourcing_groups_health_changed_by_fkey"
            columns: ["health_changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outsourcing_groups_primary_contact_id_fkey"
            columns: ["primary_contact_id"]
            isOneToOne: false
            referencedRelation: "partner_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outsourcing_groups_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_assignments: {
        Row: {
          agency_id: string
          assignment_role: string
          created_at: string
          created_by: string | null
          ended_on: string | null
          group_id: string
          id: string
          is_primary: boolean
          notes: string | null
          service_id: string | null
          started_on: string
          team_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          agency_id: string
          assignment_role?: string
          created_at?: string
          created_by?: string | null
          ended_on?: string | null
          group_id: string
          id?: string
          is_primary?: boolean
          notes?: string | null
          service_id?: string | null
          started_on?: string
          team_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          agency_id?: string
          assignment_role?: string
          created_at?: string
          created_by?: string | null
          ended_on?: string | null
          group_id?: string
          id?: string
          is_primary?: boolean
          notes?: string | null
          service_id?: string | null
          started_on?: string
          team_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_assignments_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_assignments_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "outsourcing_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_assignments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "partner_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_assignments_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_billing_models: {
        Row: {
          active: boolean
          code: string
          label: string
          recurring: boolean
          sort: number
          unit: string | null
        }
        Insert: {
          active?: boolean
          code: string
          label: string
          recurring?: boolean
          sort?: number
          unit?: string | null
        }
        Update: {
          active?: boolean
          code?: string
          label?: string
          recurring?: boolean
          sort?: number
          unit?: string | null
        }
        Relationships: []
      }
      partner_billing_schedule: {
        Row: {
          agency_id: string
          amount_cents: number
          created_at: string
          created_by: string | null
          currency: string
          due_on: string
          group_id: string
          id: string
          invoice_id: string | null
          kind: string
          notes: string | null
          sequence: number | null
          service_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          agency_id: string
          amount_cents: number
          created_at?: string
          created_by?: string | null
          currency?: string
          due_on: string
          group_id: string
          id?: string
          invoice_id?: string | null
          kind: string
          notes?: string | null
          sequence?: number | null
          service_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          agency_id?: string
          amount_cents?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          due_on?: string
          group_id?: string
          id?: string
          invoice_id?: string | null
          kind?: string
          notes?: string | null
          sequence?: number | null
          service_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_billing_schedule_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_billing_schedule_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_billing_schedule_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "outsourcing_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_billing_schedule_invoice_fk"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "partner_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_billing_schedule_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "partner_services"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_contacts: {
        Row: {
          activated_at: string | null
          agency_id: string
          created_at: string
          created_by: string | null
          email: string
          full_name: string
          group_id: string
          id: string
          invited_at: string | null
          is_primary: boolean
          phone: string | null
          status: string
          title: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          activated_at?: string | null
          agency_id: string
          created_at?: string
          created_by?: string | null
          email: string
          full_name: string
          group_id: string
          id?: string
          invited_at?: string | null
          is_primary?: boolean
          phone?: string | null
          status?: string
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          activated_at?: string | null
          agency_id?: string
          created_at?: string
          created_by?: string | null
          email?: string
          full_name?: string
          group_id?: string
          id?: string
          invited_at?: string | null
          is_primary?: boolean
          phone?: string | null
          status?: string
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_contacts_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_contacts_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "outsourcing_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_contacts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_credential_events: {
        Row: {
          action: string
          actor_id: string | null
          agency_id: string
          created_at: string
          credential_id: string
          id: number
          note: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          agency_id: string
          created_at?: string
          credential_id: string
          id?: never
          note?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          agency_id?: string
          created_at?: string
          credential_id?: string
          id?: never
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_credential_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_credential_events_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_credential_events_credential_id_fkey"
            columns: ["credential_id"]
            isOneToOne: false
            referencedRelation: "partner_credentials"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_credentials: {
        Row: {
          agency_id: string
          archived_at: string | null
          archived_reason: string | null
          code_destination: string | null
          created_at: string
          created_by: string | null
          group_id: string
          id: string
          label: string
          last_rotated_at: string | null
          notes: string | null
          platform_key: string
          rotation_due_on: string | null
          secret_id: string | null
          updated_at: string
          url: string | null
          username: string | null
        }
        Insert: {
          agency_id: string
          archived_at?: string | null
          archived_reason?: string | null
          code_destination?: string | null
          created_at?: string
          created_by?: string | null
          group_id: string
          id?: string
          label: string
          last_rotated_at?: string | null
          notes?: string | null
          platform_key: string
          rotation_due_on?: string | null
          secret_id?: string | null
          updated_at?: string
          url?: string | null
          username?: string | null
        }
        Update: {
          agency_id?: string
          archived_at?: string | null
          archived_reason?: string | null
          code_destination?: string | null
          created_at?: string
          created_by?: string | null
          group_id?: string
          id?: string
          label?: string
          last_rotated_at?: string | null
          notes?: string | null
          platform_key?: string
          rotation_due_on?: string | null
          secret_id?: string | null
          updated_at?: string
          url?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_credentials_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_credentials_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_credentials_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "outsourcing_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_credentials_platform_key_fkey"
            columns: ["platform_key"]
            isOneToOne: false
            referencedRelation: "credential_platforms"
            referencedColumns: ["key"]
          },
        ]
      }
      partner_invoice_lines: {
        Row: {
          amount_cents: number
          description: string
          id: string
          invoice_id: string
          quantity: number
          schedule_id: string | null
          service_id: string | null
          sort: number
          unit_amount_cents: number
          unit_label: string | null
        }
        Insert: {
          amount_cents?: number
          description: string
          id?: string
          invoice_id: string
          quantity?: number
          schedule_id?: string | null
          service_id?: string | null
          sort?: number
          unit_amount_cents?: number
          unit_label?: string | null
        }
        Update: {
          amount_cents?: number
          description?: string
          id?: string
          invoice_id?: string
          quantity?: number
          schedule_id?: string | null
          service_id?: string | null
          sort?: number
          unit_amount_cents?: number
          unit_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "partner_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_invoice_lines_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "partner_billing_schedule"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_invoice_lines_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "partner_services"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_invoices: {
        Row: {
          agency_id: string
          amount_paid_cents: number
          created_at: string
          created_by: string | null
          currency: string
          discount_cents: number
          due_date: string
          external_invoice_id: string | null
          group_id: string
          id: string
          invoice_number: string
          issue_date: string
          notes: string | null
          paid_at: string | null
          payment_provider:
            | Database["public"]["Enums"]["partner_payment_provider"]
            | null
          sent_at: string | null
          status: Database["public"]["Enums"]["partner_invoice_status"]
          subtotal_cents: number
          tax_cents: number
          total_cents: number
          updated_at: string
          void_reason: string | null
          voided_at: string | null
        }
        Insert: {
          agency_id: string
          amount_paid_cents?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          discount_cents?: number
          due_date: string
          external_invoice_id?: string | null
          group_id: string
          id?: string
          invoice_number: string
          issue_date?: string
          notes?: string | null
          paid_at?: string | null
          payment_provider?:
            | Database["public"]["Enums"]["partner_payment_provider"]
            | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["partner_invoice_status"]
          subtotal_cents?: number
          tax_cents?: number
          total_cents?: number
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Update: {
          agency_id?: string
          amount_paid_cents?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          discount_cents?: number
          due_date?: string
          external_invoice_id?: string | null
          group_id?: string
          id?: string
          invoice_number?: string
          issue_date?: string
          notes?: string | null
          paid_at?: string | null
          payment_provider?:
            | Database["public"]["Enums"]["partner_payment_provider"]
            | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["partner_invoice_status"]
          subtotal_cents?: number
          tax_cents?: number
          total_cents?: number
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_invoices_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_invoices_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "outsourcing_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_operations: {
        Row: {
          agency_id: string
          comm_channel: string | null
          comm_url: string | null
          crm_name: string | null
          crm_url: string | null
          ghl_location: string | null
          ghl_url: string | null
          group_id: string
          mailing_system: string | null
          mailing_url: string | null
          notes: string | null
          operations_manager_id: string | null
          sop_url: string | null
          updated_at: string
          updated_by: string | null
          uses_bes_credit_crm: boolean
        }
        Insert: {
          agency_id: string
          comm_channel?: string | null
          comm_url?: string | null
          crm_name?: string | null
          crm_url?: string | null
          ghl_location?: string | null
          ghl_url?: string | null
          group_id: string
          mailing_system?: string | null
          mailing_url?: string | null
          notes?: string | null
          operations_manager_id?: string | null
          sop_url?: string | null
          updated_at?: string
          updated_by?: string | null
          uses_bes_credit_crm?: boolean
        }
        Update: {
          agency_id?: string
          comm_channel?: string | null
          comm_url?: string | null
          crm_name?: string | null
          crm_url?: string | null
          ghl_location?: string | null
          ghl_url?: string | null
          group_id?: string
          mailing_system?: string | null
          mailing_url?: string | null
          notes?: string | null
          operations_manager_id?: string | null
          sop_url?: string | null
          updated_at?: string
          updated_by?: string | null
          uses_bes_credit_crm?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "partner_operations_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_operations_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: true
            referencedRelation: "outsourcing_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_operations_operations_manager_id_fkey"
            columns: ["operations_manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_operations_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_payment_channels: {
        Row: {
          active: boolean
          code: string
          label: string
          sort: number
        }
        Insert: {
          active?: boolean
          code: string
          label: string
          sort?: number
        }
        Update: {
          active?: boolean
          code?: string
          label?: string
          sort?: number
        }
        Relationships: []
      }
      partner_payments: {
        Row: {
          agency_id: string
          amount_cents: number
          created_at: string
          currency: string
          group_id: string
          id: string
          invoice_id: string | null
          method: string | null
          notes: string | null
          paid_on: string
          provider: Database["public"]["Enums"]["partner_payment_provider"]
          provider_transaction_id: string | null
          reconciled_at: string | null
          reconciliation_state: string
          recorded_by: string | null
          refund_amount_cents: number
          service_id: string | null
          source: string
          status: Database["public"]["Enums"]["partner_payment_status"]
          updated_at: string
        }
        Insert: {
          agency_id: string
          amount_cents: number
          created_at?: string
          currency?: string
          group_id: string
          id?: string
          invoice_id?: string | null
          method?: string | null
          notes?: string | null
          paid_on?: string
          provider: Database["public"]["Enums"]["partner_payment_provider"]
          provider_transaction_id?: string | null
          reconciled_at?: string | null
          reconciliation_state?: string
          recorded_by?: string | null
          refund_amount_cents?: number
          service_id?: string | null
          source?: string
          status?: Database["public"]["Enums"]["partner_payment_status"]
          updated_at?: string
        }
        Update: {
          agency_id?: string
          amount_cents?: number
          created_at?: string
          currency?: string
          group_id?: string
          id?: string
          invoice_id?: string | null
          method?: string | null
          notes?: string | null
          paid_on?: string
          provider?: Database["public"]["Enums"]["partner_payment_provider"]
          provider_transaction_id?: string | null
          reconciled_at?: string | null
          reconciliation_state?: string
          recorded_by?: string | null
          refund_amount_cents?: number
          service_id?: string | null
          source?: string
          status?: Database["public"]["Enums"]["partner_payment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_payments_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_payments_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "outsourcing_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "partner_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_payments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "partner_services"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_revenue_entries: {
        Row: {
          actual_cents: number | null
          agency_id: string
          amount_original_cents: number | null
          converted_amount_cents: number | null
          converted_currency: string | null
          created_at: string
          currency: string
          currency_original: string | null
          expected_cents: number | null
          fx_rate_used: number | null
          group_id: string
          id: string
          import_batch_id: string | null
          imported_at: string | null
          month: number
          notes: string | null
          payment_channel: string | null
          recorded_by: string | null
          service_id: string | null
          source: string
          source_reference: string | null
          source_type: string
          updated_at: string
          year: number
        }
        Insert: {
          actual_cents?: number | null
          agency_id: string
          amount_original_cents?: number | null
          converted_amount_cents?: number | null
          converted_currency?: string | null
          created_at?: string
          currency?: string
          currency_original?: string | null
          expected_cents?: number | null
          fx_rate_used?: number | null
          group_id: string
          id?: string
          import_batch_id?: string | null
          imported_at?: string | null
          month: number
          notes?: string | null
          payment_channel?: string | null
          recorded_by?: string | null
          service_id?: string | null
          source?: string
          source_reference?: string | null
          source_type?: string
          updated_at?: string
          year: number
        }
        Update: {
          actual_cents?: number | null
          agency_id?: string
          amount_original_cents?: number | null
          converted_amount_cents?: number | null
          converted_currency?: string | null
          created_at?: string
          currency?: string
          currency_original?: string | null
          expected_cents?: number | null
          fx_rate_used?: number | null
          group_id?: string
          id?: string
          import_batch_id?: string | null
          imported_at?: string | null
          month?: number
          notes?: string | null
          payment_channel?: string | null
          recorded_by?: string | null
          service_id?: string | null
          source?: string
          source_reference?: string | null
          source_type?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "partner_revenue_entries_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_revenue_entries_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "outsourcing_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_revenue_entries_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_revenue_entries_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "partner_services"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_service_billing: {
        Row: {
          agency_id: string
          autopay: boolean
          billing_model: string | null
          billing_status:
            | Database["public"]["Enums"]["partner_billing_status"]
            | null
          contracted_hours: number | null
          currency: string
          currency_original: string | null
          effective_from: string
          effective_to: string | null
          expected_monthly_cents: number | null
          fx_rate_used: number | null
          id: string
          invoice_day: string | null
          mrr_cents: number | null
          payment_channel: string | null
          payment_frequency: string | null
          pricing_notes: string | null
          quantity: number | null
          quantity_source: string
          rate_cents: number | null
          service_id: string
          superseded_by: string | null
          transaction_type: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          agency_id: string
          autopay?: boolean
          billing_model?: string | null
          billing_status?:
            | Database["public"]["Enums"]["partner_billing_status"]
            | null
          contracted_hours?: number | null
          currency?: string
          currency_original?: string | null
          effective_from?: string
          effective_to?: string | null
          expected_monthly_cents?: number | null
          fx_rate_used?: number | null
          id?: string
          invoice_day?: string | null
          mrr_cents?: number | null
          payment_channel?: string | null
          payment_frequency?: string | null
          pricing_notes?: string | null
          quantity?: number | null
          quantity_source?: string
          rate_cents?: number | null
          service_id: string
          superseded_by?: string | null
          transaction_type?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          agency_id?: string
          autopay?: boolean
          billing_model?: string | null
          billing_status?:
            | Database["public"]["Enums"]["partner_billing_status"]
            | null
          contracted_hours?: number | null
          currency?: string
          currency_original?: string | null
          effective_from?: string
          effective_to?: string | null
          expected_monthly_cents?: number | null
          fx_rate_used?: number | null
          id?: string
          invoice_day?: string | null
          mrr_cents?: number | null
          payment_channel?: string | null
          payment_frequency?: string | null
          pricing_notes?: string | null
          quantity?: number | null
          quantity_source?: string
          rate_cents?: number | null
          service_id?: string
          superseded_by?: string | null
          transaction_type?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_service_billing_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_service_billing_billing_model_fkey"
            columns: ["billing_model"]
            isOneToOne: false
            referencedRelation: "partner_billing_models"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "partner_service_billing_channel_fk"
            columns: ["payment_channel"]
            isOneToOne: false
            referencedRelation: "partner_payment_channels"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "partner_service_billing_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "partner_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_service_billing_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "partner_service_billing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_service_billing_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_service_types: {
        Row: {
          active: boolean
          category: string
          code: string
          label: string
          sort: number
        }
        Insert: {
          active?: boolean
          category: string
          code: string
          label: string
          sort?: number
        }
        Update: {
          active?: boolean
          category?: string
          code?: string
          label?: string
          sort?: number
        }
        Relationships: []
      }
      partner_services: {
        Row: {
          agency_id: string
          billing_authority: Database["public"]["Enums"]["partner_billing_authority"]
          cancellation_effective_on: string | null
          cancellation_reason: string | null
          client_volume_text: string | null
          contract_value_cents: number | null
          created_at: string
          created_by: string | null
          description: string | null
          ended_on: string | null
          group_id: string
          id: string
          import_batch_id: string | null
          imported_at: string | null
          name: string
          notes: string | null
          processor_id: string | null
          quantity: number | null
          quantity_unit: string | null
          service_type: string | null
          source_reference: string | null
          source_row_ref: string | null
          source_type: string
          started_on: string | null
          status: Database["public"]["Enums"]["partner_service_status"]
          team_id: string | null
          updated_at: string
        }
        Insert: {
          agency_id: string
          billing_authority?: Database["public"]["Enums"]["partner_billing_authority"]
          cancellation_effective_on?: string | null
          cancellation_reason?: string | null
          client_volume_text?: string | null
          contract_value_cents?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          ended_on?: string | null
          group_id: string
          id?: string
          import_batch_id?: string | null
          imported_at?: string | null
          name: string
          notes?: string | null
          processor_id?: string | null
          quantity?: number | null
          quantity_unit?: string | null
          service_type?: string | null
          source_reference?: string | null
          source_row_ref?: string | null
          source_type?: string
          started_on?: string | null
          status?: Database["public"]["Enums"]["partner_service_status"]
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          agency_id?: string
          billing_authority?: Database["public"]["Enums"]["partner_billing_authority"]
          cancellation_effective_on?: string | null
          cancellation_reason?: string | null
          client_volume_text?: string | null
          contract_value_cents?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          ended_on?: string | null
          group_id?: string
          id?: string
          import_batch_id?: string | null
          imported_at?: string | null
          name?: string
          notes?: string | null
          processor_id?: string | null
          quantity?: number | null
          quantity_unit?: string | null
          service_type?: string | null
          source_reference?: string | null
          source_row_ref?: string | null
          source_type?: string
          started_on?: string | null
          status?: Database["public"]["Enums"]["partner_service_status"]
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_services_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_services_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_services_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "outsourcing_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_services_processor_id_fkey"
            columns: ["processor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_services_service_type_fkey"
            columns: ["service_type"]
            isOneToOne: false
            referencedRelation: "partner_service_types"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "partner_services_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          added_by: string | null
          card_brand: string | null
          created_at: string
          customer_profile_id: string
          exp_month: number | null
          exp_year: number | null
          id: string
          is_default: boolean
          last4: string | null
          organization_id: string
          payment_profile_id: string
          provider: string
        }
        Insert: {
          added_by?: string | null
          card_brand?: string | null
          created_at?: string
          customer_profile_id: string
          exp_month?: number | null
          exp_year?: number | null
          id?: string
          is_default?: boolean
          last4?: string | null
          organization_id: string
          payment_profile_id: string
          provider?: string
        }
        Update: {
          added_by?: string | null
          card_brand?: string | null
          created_at?: string
          customer_profile_id?: string
          exp_month?: number | null
          exp_year?: number | null
          id?: string
          is_default?: boolean
          last4?: string | null
          organization_id?: string
          payment_profile_id?: string
          provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_methods_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_transactions: {
        Row: {
          amount_cents: number
          charged_by: string | null
          created_at: string
          currency: string
          description: string | null
          id: string
          last4: string | null
          organization_id: string
          provider: string
          provider_txn_id: string | null
          response_code: string | null
          response_text: string | null
          status: Database["public"]["Enums"]["payment_status"]
          subscription_id: string | null
        }
        Insert: {
          amount_cents: number
          charged_by?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          last4?: string | null
          organization_id: string
          provider?: string
          provider_txn_id?: string | null
          response_code?: string | null
          response_text?: string | null
          status: Database["public"]["Enums"]["payment_status"]
          subscription_id?: string | null
        }
        Update: {
          amount_cents?: number
          charged_by?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          last4?: string | null
          organization_id?: string
          provider?: string
          provider_txn_id?: string | null
          response_code?: string | null
          response_text?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_transactions_charged_by_fkey"
            columns: ["charged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "organization_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_keys: {
        Row: {
          description: string | null
          key: string
          label: string
          module: string
          security_relevant: boolean
          sort: number
        }
        Insert: {
          description?: string | null
          key: string
          label: string
          module: string
          security_relevant?: boolean
          sort?: number
        }
        Update: {
          description?: string | null
          key?: string
          label?: string
          module?: string
          security_relevant?: boolean
          sort?: number
        }
        Relationships: []
      }
      plan_addons: {
        Row: {
          applies_to: string[]
          key: string
          label: string
          monthly_cents: number
          position: number
          unit: string
        }
        Insert: {
          applies_to: string[]
          key: string
          label: string
          monthly_cents: number
          position?: number
          unit: string
        }
        Update: {
          applies_to?: string[]
          key?: string
          label?: string
          monthly_cents?: number
          position?: number
          unit?: string
        }
        Relationships: []
      }
      plan_ai_allowances: {
        Row: {
          monthly_credits: number
          note: string | null
          plan_key: string
          updated_at: string
        }
        Insert: {
          monthly_credits?: number
          note?: string | null
          plan_key: string
          updated_at?: string
        }
        Update: {
          monthly_credits?: number
          note?: string | null
          plan_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_ai_allowances_plan_key_fkey"
            columns: ["plan_key"]
            isOneToOne: true
            referencedRelation: "plans"
            referencedColumns: ["key"]
          },
        ]
      }
      plans: {
        Row: {
          active_records_included: number
          annual_cents: number | null
          choose_one: boolean
          includes_crm: boolean
          is_public: boolean
          is_recommended: boolean
          key: string
          label: string
          monthly_cents: number
          position: number
          products: Database["public"]["Enums"]["product_key"][]
          public_trial: boolean
          seats_included: number
          tagline: string | null
          trial_days: number
          trial_grant_plan: string | null
        }
        Insert: {
          active_records_included?: number
          annual_cents?: number | null
          choose_one?: boolean
          includes_crm?: boolean
          is_public?: boolean
          is_recommended?: boolean
          key: string
          label: string
          monthly_cents?: number
          position?: number
          products: Database["public"]["Enums"]["product_key"][]
          public_trial?: boolean
          seats_included?: number
          tagline?: string | null
          trial_days?: number
          trial_grant_plan?: string | null
        }
        Update: {
          active_records_included?: number
          annual_cents?: number | null
          choose_one?: boolean
          includes_crm?: boolean
          is_public?: boolean
          is_recommended?: boolean
          key?: string
          label?: string
          monthly_cents?: number
          position?: number
          products?: Database["public"]["Enums"]["product_key"][]
          public_trial?: boolean
          seats_included?: number
          tagline?: string | null
          trial_days?: number
          trial_grant_plan?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plans_trial_grant_plan_fkey"
            columns: ["trial_grant_plan"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["key"]
          },
        ]
      }
      policy_updates: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          affected_file_ids: string[]
          change_kind: Database["public"]["Enums"]["policy_change_kind"]
          created_at: string
          created_by: string | null
          from_version: number | null
          id: string
          program_id: string
          summary: string
          to_version: number
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          affected_file_ids?: string[]
          change_kind: Database["public"]["Enums"]["policy_change_kind"]
          created_at?: string
          created_by?: string | null
          from_version?: number | null
          id?: string
          program_id: string
          summary: string
          to_version: number
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          affected_file_ids?: string[]
          change_kind?: Database["public"]["Enums"]["policy_change_kind"]
          created_at?: string
          created_by?: string | null
          from_version?: number | null
          id?: string
          program_id?: string
          summary?: string
          to_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "policy_updates_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_updates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_updates_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "lender_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      position_assignments: {
        Row: {
          agency_id: string
          assignment_type: string
          created_at: string
          created_by: string | null
          effective_from: string
          effective_until: string | null
          ended_at: string | null
          ended_by: string | null
          id: string
          note: string | null
          position_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agency_id: string
          assignment_type?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_until?: string | null
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          note?: string | null
          position_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agency_id?: string
          assignment_type?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_until?: string | null
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          note?: string | null
          position_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "position_assignments_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "position_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "position_assignments_ended_by_fkey"
            columns: ["ended_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "position_assignments_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "position_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      positions: {
        Row: {
          agency_id: string
          archived_at: string | null
          created_at: string
          created_by: string | null
          department_id: string | null
          description: string | null
          division_id: string | null
          headcount: number
          id: string
          is_fixture: boolean
          reports_to_position_id: string | null
          sort: number
          status: string
          team_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          agency_id: string
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          division_id?: string | null
          headcount?: number
          id?: string
          is_fixture?: boolean
          reports_to_position_id?: string | null
          sort?: number
          status?: string
          team_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          agency_id?: string
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          division_id?: string | null
          headcount?: number
          id?: string
          is_fixture?: boolean
          reports_to_position_id?: string | null
          sort?: number
          status?: string
          team_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "positions_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_reports_to_position_id_fkey"
            columns: ["reports_to_position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      product_entitlements: {
        Row: {
          enabled: boolean
          organization_id: string
          product: Database["public"]["Enums"]["product_key"]
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          organization_id: string
          product: Database["public"]["Enums"]["product_key"]
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          organization_id?: string
          product?: Database["public"]["Enums"]["product_key"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_entitlements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      production_departments: {
        Row: {
          key: string
          label: string
          position: number
          service: Database["public"]["Enums"]["fulfillment_service"]
        }
        Insert: {
          key: string
          label: string
          position?: number
          service: Database["public"]["Enums"]["fulfillment_service"]
        }
        Update: {
          key?: string
          label?: string
          position?: number
          service?: Database["public"]["Enums"]["fulfillment_service"]
        }
        Relationships: []
      }
      production_log_revisions: {
        Row: {
          id: string
          log_id: string
          previous: Json
          reason: string | null
          revised_at: string
          revised_by: string | null
        }
        Insert: {
          id?: string
          log_id: string
          previous: Json
          reason?: string | null
          revised_at?: string
          revised_by?: string | null
        }
        Update: {
          id?: string
          log_id?: string
          previous?: Json
          reason?: string | null
          revised_at?: string
          revised_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_log_revisions_log_id_fkey"
            columns: ["log_id"]
            isOneToOne: false
            referencedRelation: "production_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_log_revisions_revised_by_fkey"
            columns: ["revised_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      production_logs: {
        Row: {
          actions: string[]
          agency_id: string
          client_id: string | null
          completed_at: string
          created_at: string
          department:
            | Database["public"]["Enums"]["fulfillment_department"]
            | null
          department_key: string | null
          division_id: string
          employee_id: string
          funding_client_id: string | null
          funding_deal_id: string | null
          id: string
          is_voided: boolean
          organization_id: string | null
          outsourcing_group_id: string | null
          production_unit_quantity: number
          production_unit_type: string
          request_id: string | null
          resulting_status: string | null
          service: Database["public"]["Enums"]["fulfillment_service"]
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
          work_date: string
          work_item_id: string | null
          work_notes: string | null
        }
        Insert: {
          actions?: string[]
          agency_id: string
          client_id?: string | null
          completed_at?: string
          created_at?: string
          department?:
            | Database["public"]["Enums"]["fulfillment_department"]
            | null
          department_key?: string | null
          division_id: string
          employee_id: string
          funding_client_id?: string | null
          funding_deal_id?: string | null
          id?: string
          is_voided?: boolean
          organization_id?: string | null
          outsourcing_group_id?: string | null
          production_unit_quantity?: number
          production_unit_type: string
          request_id?: string | null
          resulting_status?: string | null
          service: Database["public"]["Enums"]["fulfillment_service"]
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          work_date: string
          work_item_id?: string | null
          work_notes?: string | null
        }
        Update: {
          actions?: string[]
          agency_id?: string
          client_id?: string | null
          completed_at?: string
          created_at?: string
          department?:
            | Database["public"]["Enums"]["fulfillment_department"]
            | null
          department_key?: string | null
          division_id?: string
          employee_id?: string
          funding_client_id?: string | null
          funding_deal_id?: string | null
          id?: string
          is_voided?: boolean
          organization_id?: string | null
          outsourcing_group_id?: string | null
          production_unit_quantity?: number
          production_unit_type?: string
          request_id?: string | null
          resulting_status?: string | null
          service?: Database["public"]["Enums"]["fulfillment_service"]
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          work_date?: string
          work_item_id?: string | null
          work_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_logs_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "fulfillment_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_logs_department_fk"
            columns: ["service", "department_key"]
            isOneToOne: false
            referencedRelation: "production_departments"
            referencedColumns: ["service", "key"]
          },
          {
            foreignKeyName: "production_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_logs_funding_client_id_fkey"
            columns: ["funding_client_id"]
            isOneToOne: false
            referencedRelation: "funding_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_logs_funding_deal_id_fkey"
            columns: ["funding_deal_id"]
            isOneToOne: false
            referencedRelation: "funding_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_logs_outsourcing_group_id_fkey"
            columns: ["outsourcing_group_id"]
            isOneToOne: false
            referencedRelation: "outsourcing_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_logs_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_logs_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_attention"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_logs_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          avatar_url: string | null
          birth_day: number | null
          birth_month: number | null
          birthday_visible: boolean
          created_at: string
          email: string
          full_name: string | null
          id: string
          is_fixture: boolean
          phone: string | null
          preferred_name: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          avatar_url?: string | null
          birth_day?: number | null
          birth_month?: number | null
          birthday_visible?: boolean
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          is_fixture?: boolean
          phone?: string | null
          preferred_name?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          avatar_url?: string | null
          birth_day?: number | null
          birth_month?: number | null
          birthday_visible?: boolean
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          is_fixture?: boolean
          phone?: string | null
          preferred_name?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      public_email_domains: {
        Row: {
          domain: string
        }
        Insert: {
          domain: string
        }
        Update: {
          domain?: string
        }
        Relationships: []
      }
      record_grants: {
        Row: {
          created_at: string
          external_membership_id: string
          granted_by: string | null
          id: string
          record_id: string
          record_type: string
        }
        Insert: {
          created_at?: string
          external_membership_id: string
          granted_by?: string | null
          id?: string
          record_id: string
          record_type: string
        }
        Update: {
          created_at?: string
          external_membership_id?: string
          granted_by?: string | null
          id?: string
          record_id?: string
          record_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "record_grants_external_membership_id_fkey"
            columns: ["external_membership_id"]
            isOneToOne: false
            referencedRelation: "external_memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "record_grants_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_attributions: {
        Row: {
          attributed_at: string
          client_id: string
          code_id: string
          id: string
          organization_id: string
          source: string
        }
        Insert: {
          attributed_at?: string
          client_id: string
          code_id: string
          id?: string
          organization_id: string
          source?: string
        }
        Update: {
          attributed_at?: string
          client_id?: string
          code_id?: string
          id?: string
          organization_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_attributions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_attributions_code_id_fkey"
            columns: ["code_id"]
            isOneToOne: false
            referencedRelation: "referral_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_attributions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_codes: {
        Row: {
          active: boolean
          code: string
          created_at: string
          created_by: string | null
          id: string
          label: string | null
          organization_id: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          organization_id: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_codes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_events: {
        Row: {
          amount_cents: number | null
          attribution_id: string
          id: string
          kind: Database["public"]["Enums"]["referral_event_kind"]
          note: string | null
          occurred_at: string
          recorded_by: string | null
        }
        Insert: {
          amount_cents?: number | null
          attribution_id: string
          id?: string
          kind: Database["public"]["Enums"]["referral_event_kind"]
          note?: string | null
          occurred_at?: string
          recorded_by?: string | null
        }
        Update: {
          amount_cents?: number | null
          attribution_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["referral_event_kind"]
          note?: string | null
          occurred_at?: string
          recorded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_events_attribution_id_fkey"
            columns: ["attribution_id"]
            isOneToOne: false
            referencedRelation: "referral_attributions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_events_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      renewal_opportunities: {
        Row: {
          file_id: string
          funded_deal_id: string
          id: string
          new_file_id: string | null
          next_follow_up_at: string | null
          note: string | null
          potential_renewal_date: string | null
          status: Database["public"]["Enums"]["renewal_status"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          file_id: string
          funded_deal_id: string
          id?: string
          new_file_id?: string | null
          next_follow_up_at?: string | null
          note?: string | null
          potential_renewal_date?: string | null
          status?: Database["public"]["Enums"]["renewal_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          file_id?: string
          funded_deal_id?: string
          id?: string
          new_file_id?: string | null
          next_follow_up_at?: string | null
          note?: string | null
          potential_renewal_date?: string | null
          status?: Database["public"]["Enums"]["renewal_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "renewal_opportunities_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "borrower_funding_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renewal_opportunities_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "funding_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renewal_opportunities_funded_deal_id_fkey"
            columns: ["funded_deal_id"]
            isOneToOne: false
            referencedRelation: "funded_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renewal_opportunities_new_file_id_fkey"
            columns: ["new_file_id"]
            isOneToOne: false
            referencedRelation: "borrower_funding_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renewal_opportunities_new_file_id_fkey"
            columns: ["new_file_id"]
            isOneToOne: false
            referencedRelation: "funding_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renewal_opportunities_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      report_completeness: {
        Row: {
          bureau: string | null
          created_at: string
          field_key: string
          id: string
          reason: string | null
          report_id: string
          report_item_id: string | null
          state: Database["public"]["Enums"]["completeness_state"]
        }
        Insert: {
          bureau?: string | null
          created_at?: string
          field_key: string
          id?: string
          reason?: string | null
          report_id: string
          report_item_id?: string | null
          state: Database["public"]["Enums"]["completeness_state"]
        }
        Update: {
          bureau?: string | null
          created_at?: string
          field_key?: string
          id?: string
          reason?: string | null
          report_id?: string
          report_item_id?: string | null
          state?: Database["public"]["Enums"]["completeness_state"]
        }
        Relationships: [
          {
            foreignKeyName: "report_completeness_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "credit_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_completeness_report_item_id_fkey"
            columns: ["report_item_id"]
            isOneToOne: false
            referencedRelation: "report_items"
            referencedColumns: ["id"]
          },
        ]
      }
      report_findings: {
        Row: {
          account_ref: string
          catalogue_version: string
          classification: Database["public"]["Enums"]["finding_classification"]
          client_id: string
          created_at: string
          created_by: string | null
          evidence: Json
          fields: string[]
          human_disposition:
            | Database["public"]["Enums"]["finding_disposition"]
            | null
          human_review_required: boolean
          id: string
          observation: string
          raw_metro2_verified: boolean
          remedy: string
          report_id: string
          reviewed_at: string | null
          reviewer: string | null
          reviewer_reason: string | null
          route: string
          rule_id: string
          rule_version: number
          verdict: string
        }
        Insert: {
          account_ref: string
          catalogue_version: string
          classification: Database["public"]["Enums"]["finding_classification"]
          client_id: string
          created_at?: string
          created_by?: string | null
          evidence?: Json
          fields?: string[]
          human_disposition?:
            | Database["public"]["Enums"]["finding_disposition"]
            | null
          human_review_required?: boolean
          id?: string
          observation: string
          raw_metro2_verified?: boolean
          remedy: string
          report_id: string
          reviewed_at?: string | null
          reviewer?: string | null
          reviewer_reason?: string | null
          route: string
          rule_id: string
          rule_version: number
          verdict: string
        }
        Update: {
          account_ref?: string
          catalogue_version?: string
          classification?: Database["public"]["Enums"]["finding_classification"]
          client_id?: string
          created_at?: string
          created_by?: string | null
          evidence?: Json
          fields?: string[]
          human_disposition?:
            | Database["public"]["Enums"]["finding_disposition"]
            | null
          human_review_required?: boolean
          id?: string
          observation?: string
          raw_metro2_verified?: boolean
          remedy?: string
          report_id?: string
          reviewed_at?: string | null
          reviewer?: string | null
          reviewer_reason?: string | null
          route?: string
          rule_id?: string
          rule_version?: number
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_findings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "fulfillment_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_findings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_findings_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "credit_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_findings_reviewer_fkey"
            columns: ["reviewer"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      report_item_bureau_values: {
        Row: {
          account_information_date: string | null
          account_number_masked: string | null
          account_rating: string | null
          account_type: string | null
          asset_cents: number | null
          balance_cents: number | null
          bureau: string
          court: string | null
          created_at: string
          credit_limit_cents: number | null
          creditor_type: string | null
          date_closed: string | null
          date_last_active: string | null
          date_last_payment: string | null
          dispute_status: string | null
          dofd: string | null
          exempt_cents: number | null
          filed_on: string | null
          high_balance_cents: number | null
          id: string
          inquiry_date: string | null
          inquiry_type: string | null
          last_verified: string | null
          liability_cents: number | null
          monthly_payment_cents: number | null
          open_date: string | null
          parser_version: string
          past_due_cents: number | null
          payment_frequency: string | null
          payment_history: string[] | null
          payment_status: string | null
          raw_metro2_verified: boolean
          reference_number: string | null
          remarks: string | null
          report_item_id: string
          reporting_period: string | null
          responsibility_raw: string | null
          source_locator: Json | null
          source_type: string
          status: string | null
          term_months: number | null
        }
        Insert: {
          account_information_date?: string | null
          account_number_masked?: string | null
          account_rating?: string | null
          account_type?: string | null
          asset_cents?: number | null
          balance_cents?: number | null
          bureau: string
          court?: string | null
          created_at?: string
          credit_limit_cents?: number | null
          creditor_type?: string | null
          date_closed?: string | null
          date_last_active?: string | null
          date_last_payment?: string | null
          dispute_status?: string | null
          dofd?: string | null
          exempt_cents?: number | null
          filed_on?: string | null
          high_balance_cents?: number | null
          id?: string
          inquiry_date?: string | null
          inquiry_type?: string | null
          last_verified?: string | null
          liability_cents?: number | null
          monthly_payment_cents?: number | null
          open_date?: string | null
          parser_version: string
          past_due_cents?: number | null
          payment_frequency?: string | null
          payment_history?: string[] | null
          payment_status?: string | null
          raw_metro2_verified?: boolean
          reference_number?: string | null
          remarks?: string | null
          report_item_id: string
          reporting_period?: string | null
          responsibility_raw?: string | null
          source_locator?: Json | null
          source_type?: string
          status?: string | null
          term_months?: number | null
        }
        Update: {
          account_information_date?: string | null
          account_number_masked?: string | null
          account_rating?: string | null
          account_type?: string | null
          asset_cents?: number | null
          balance_cents?: number | null
          bureau?: string
          court?: string | null
          created_at?: string
          credit_limit_cents?: number | null
          creditor_type?: string | null
          date_closed?: string | null
          date_last_active?: string | null
          date_last_payment?: string | null
          dispute_status?: string | null
          dofd?: string | null
          exempt_cents?: number | null
          filed_on?: string | null
          high_balance_cents?: number | null
          id?: string
          inquiry_date?: string | null
          inquiry_type?: string | null
          last_verified?: string | null
          liability_cents?: number | null
          monthly_payment_cents?: number | null
          open_date?: string | null
          parser_version?: string
          past_due_cents?: number | null
          payment_frequency?: string | null
          payment_history?: string[] | null
          payment_status?: string | null
          raw_metro2_verified?: boolean
          reference_number?: string | null
          remarks?: string | null
          report_item_id?: string
          reporting_period?: string | null
          responsibility_raw?: string | null
          source_locator?: Json | null
          source_type?: string
          status?: string | null
          term_months?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "report_item_bureau_values_report_item_id_fkey"
            columns: ["report_item_id"]
            isOneToOne: false
            referencedRelation: "report_items"
            referencedColumns: ["id"]
          },
        ]
      }
      report_items: {
        Row: {
          account_ref: string
          balance_cents: number | null
          balance_text: string | null
          bureaus: string[]
          credit_limit_cents: number | null
          credit_limit_text: string | null
          dofd: string | null
          id: string
          kind: string
          linked_creditor: string | null
          name: string
          open_date: string | null
          position: number
          raw: Json | null
          remarks: string | null
          report_id: string
          source_columns: Json | null
          status: string
          subtype: string | null
        }
        Insert: {
          account_ref: string
          balance_cents?: number | null
          balance_text?: string | null
          bureaus: string[]
          credit_limit_cents?: number | null
          credit_limit_text?: string | null
          dofd?: string | null
          id?: string
          kind: string
          linked_creditor?: string | null
          name: string
          open_date?: string | null
          position: number
          raw?: Json | null
          remarks?: string | null
          report_id: string
          source_columns?: Json | null
          status: string
          subtype?: string | null
        }
        Update: {
          account_ref?: string
          balance_cents?: number | null
          balance_text?: string | null
          bureaus?: string[]
          credit_limit_cents?: number | null
          credit_limit_text?: string | null
          dofd?: string | null
          id?: string
          kind?: string
          linked_creditor?: string | null
          name?: string
          open_date?: string | null
          position?: number
          raw?: Json | null
          remarks?: string | null
          report_id?: string
          source_columns?: Json | null
          status?: string
          subtype?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_items_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "credit_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_partial_acceptances: {
        Row: {
          accepted_at: string
          accepted_by: string
          id: string
          reason: string
          report_id: string
        }
        Insert: {
          accepted_at?: string
          accepted_by: string
          id?: string
          reason: string
          report_id: string
        }
        Update: {
          accepted_at?: string
          accepted_by?: string
          id?: string
          reason?: string
          report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_partial_acceptances_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_partial_acceptances_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: true
            referencedRelation: "credit_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_reconciliation: {
        Row: {
          bureau: string | null
          check_key: string
          comparable: boolean
          count_window: string | null
          created_at: string
          id: string
          ok: boolean
          parsed: number
          reason: string | null
          report_id: string
          source_definition: string | null
          source_section: string | null
          stated: number | null
        }
        Insert: {
          bureau?: string | null
          check_key: string
          comparable?: boolean
          count_window?: string | null
          created_at?: string
          id?: string
          ok: boolean
          parsed: number
          reason?: string | null
          report_id: string
          source_definition?: string | null
          source_section?: string | null
          stated?: number | null
        }
        Update: {
          bureau?: string | null
          check_key?: string
          comparable?: boolean
          count_window?: string | null
          created_at?: string
          id?: string
          ok?: boolean
          parsed?: number
          reason?: string | null
          report_id?: string
          source_definition?: string | null
          source_section?: string | null
          stated?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "report_reconciliation_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "credit_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_scores: {
        Row: {
          bureau: string
          model: string
          report_id: string
          score: number
        }
        Insert: {
          bureau: string
          model: string
          report_id: string
          score: number
        }
        Update: {
          bureau?: string
          model?: string
          report_id?: string
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "report_scores_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "credit_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      requirement_rules: {
        Row: {
          active: boolean
          agency_id: string
          all_pages_required: boolean
          condition: Json
          created_at: string
          created_by: string | null
          document_type: string
          effective_from: string
          effective_until: string | null
          id: string
          last_verified_at: string | null
          lender_id: string | null
          lookback_months: number | null
          max_age_days: number | null
          organization_id: string | null
          party_kind: Database["public"]["Enums"]["funding_party_kind"]
          product_family: string
          product_subtype: string | null
          program_id: string | null
          requirement: Database["public"]["Enums"]["document_requirement"]
          sequence_required: boolean
          signature_required: boolean
          source_published_date: string | null
          source_reference: string | null
          source_type: string
          verified_by: string | null
          version: number
        }
        Insert: {
          active?: boolean
          agency_id: string
          all_pages_required?: boolean
          condition?: Json
          created_at?: string
          created_by?: string | null
          document_type: string
          effective_from: string
          effective_until?: string | null
          id?: string
          last_verified_at?: string | null
          lender_id?: string | null
          lookback_months?: number | null
          max_age_days?: number | null
          organization_id?: string | null
          party_kind: Database["public"]["Enums"]["funding_party_kind"]
          product_family: string
          product_subtype?: string | null
          program_id?: string | null
          requirement?: Database["public"]["Enums"]["document_requirement"]
          sequence_required?: boolean
          signature_required?: boolean
          source_published_date?: string | null
          source_reference?: string | null
          source_type: string
          verified_by?: string | null
          version?: number
        }
        Update: {
          active?: boolean
          agency_id?: string
          all_pages_required?: boolean
          condition?: Json
          created_at?: string
          created_by?: string | null
          document_type?: string
          effective_from?: string
          effective_until?: string | null
          id?: string
          last_verified_at?: string | null
          lender_id?: string | null
          lookback_months?: number | null
          max_age_days?: number | null
          organization_id?: string | null
          party_kind?: Database["public"]["Enums"]["funding_party_kind"]
          product_family?: string
          product_subtype?: string | null
          program_id?: string | null
          requirement?: Database["public"]["Enums"]["document_requirement"]
          sequence_required?: boolean
          signature_required?: boolean
          source_published_date?: string | null
          source_reference?: string | null
          source_type?: string
          verified_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "requirement_rules_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requirement_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requirement_rules_lender_id_fkey"
            columns: ["lender_id"]
            isOneToOne: false
            referencedRelation: "lenders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requirement_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requirement_rules_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "lender_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requirement_rules_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          allowed: boolean
          key: string
          organization_id: string | null
          role: Database["public"]["Enums"]["org_role"]
        }
        Insert: {
          allowed: boolean
          key: string
          organization_id?: string | null
          role: Database["public"]["Enums"]["org_role"]
        }
        Update: {
          allowed?: boolean
          key?: string
          organization_id?: string | null
          role?: Database["public"]["Enums"]["org_role"]
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_key_fkey"
            columns: ["key"]
            isOneToOne: false
            referencedRelation: "permission_keys"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "role_permissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      team_memberships: {
        Row: {
          created_at: string
          is_lead: boolean
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          is_lead?: boolean
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          is_lead?: boolean
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_memberships_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          agency_id: string | null
          archived_at: string | null
          created_at: string
          department_id: string | null
          description: string | null
          id: string
          is_fixture: boolean
          name: string
          organization_id: string | null
          sort: number
        }
        Insert: {
          agency_id?: string | null
          archived_at?: string | null
          created_at?: string
          department_id?: string | null
          description?: string | null
          id?: string
          is_fixture?: boolean
          name: string
          organization_id?: string | null
          sort?: number
        }
        Update: {
          agency_id?: string | null
          archived_at?: string | null
          created_at?: string
          department_id?: string | null
          description?: string | null
          id?: string
          is_fixture?: boolean
          name?: string
          organization_id?: string | null
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "teams_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          agency_id: string
          client_id: string | null
          created_at: string
          division_id: string
          duration_minutes: number | null
          employee_id: string
          ended_at: string | null
          id: string
          organization_id: string | null
          started_at: string
          task_note: string | null
          work_date: string
          work_item_id: string | null
        }
        Insert: {
          agency_id: string
          client_id?: string | null
          created_at?: string
          division_id?: string
          duration_minutes?: number | null
          employee_id: string
          ended_at?: string | null
          id?: string
          organization_id?: string | null
          started_at?: string
          task_note?: string | null
          work_date?: string
          work_item_id?: string | null
        }
        Update: {
          agency_id?: string
          client_id?: string | null
          created_at?: string
          division_id?: string
          duration_minutes?: number | null
          employee_id?: string
          ended_at?: string | null
          id?: string
          organization_id?: string | null
          started_at?: string
          task_note?: string | null
          work_date?: string
          work_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "fulfillment_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_attention"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          dashboard_cards: Json | null
          pinned_org_ids: string[]
          recent_org_ids: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          dashboard_cards?: Json | null
          pinned_org_ids?: string[]
          recent_org_ids?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          dashboard_cards?: Json | null
          pinned_org_ids?: string[]
          recent_org_ids?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_results: {
        Row: {
          created_at: string
          file_id: string
          id: string
          instance_id: string | null
          party_id: string | null
          provider: string
          provider_kind: Database["public"]["Enums"]["verification_provider_kind"]
          provider_ref: string | null
          requested_at: string
          requested_by: string | null
          signals: Json
          status: Database["public"]["Enums"]["verification_status"]
        }
        Insert: {
          created_at?: string
          file_id: string
          id?: string
          instance_id?: string | null
          party_id?: string | null
          provider: string
          provider_kind: Database["public"]["Enums"]["verification_provider_kind"]
          provider_ref?: string | null
          requested_at?: string
          requested_by?: string | null
          signals?: Json
          status: Database["public"]["Enums"]["verification_status"]
        }
        Update: {
          created_at?: string
          file_id?: string
          id?: string
          instance_id?: string | null
          party_id?: string | null
          provider?: string
          provider_kind?: Database["public"]["Enums"]["verification_provider_kind"]
          provider_ref?: string | null
          requested_at?: string
          requested_by?: string | null
          signals?: Json
          status?: Database["public"]["Enums"]["verification_status"]
        }
        Relationships: [
          {
            foreignKeyName: "verification_results_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "borrower_funding_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_results_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "funding_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_results_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "document_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_results_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "funding_parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_results_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_deliveries: {
        Row: {
          agency_id: string
          client_id: string | null
          client_name: string
          created_at: string
          endpoint_id: string | null
          endpoint_name: string
          id: number
          message: string | null
          new_status: string
          partner_name: string
          previous_status: string | null
          status: Database["public"]["Enums"]["webhook_delivery_status"]
        }
        Insert: {
          agency_id: string
          client_id?: string | null
          client_name: string
          created_at?: string
          endpoint_id?: string | null
          endpoint_name: string
          id?: never
          message?: string | null
          new_status: string
          partner_name: string
          previous_status?: string | null
          status: Database["public"]["Enums"]["webhook_delivery_status"]
        }
        Update: {
          agency_id?: string
          client_id?: string | null
          client_name?: string
          created_at?: string
          endpoint_id?: string | null
          endpoint_name?: string
          id?: never
          message?: string | null
          new_status?: string
          partner_name?: string
          previous_status?: string | null
          status?: Database["public"]["Enums"]["webhook_delivery_status"]
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_deliveries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "fulfillment_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_deliveries_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "webhook_endpoints"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_endpoints: {
        Row: {
          agency_id: string
          created_at: string
          credential_hint: string | null
          enabled: boolean
          fires: number
          id: string
          last_fired_at: string | null
          name: string
          type: Database["public"]["Enums"]["webhook_endpoint_type"]
          updated_at: string
          url: string | null
        }
        Insert: {
          agency_id: string
          created_at?: string
          credential_hint?: string | null
          enabled?: boolean
          fires?: number
          id?: string
          last_fired_at?: string | null
          name: string
          type: Database["public"]["Enums"]["webhook_endpoint_type"]
          updated_at?: string
          url?: string | null
        }
        Update: {
          agency_id?: string
          created_at?: string
          credential_hint?: string | null
          enabled?: boolean
          fires?: number
          id?: string
          last_fired_at?: string | null
          name?: string
          type?: Database["public"]["Enums"]["webhook_endpoint_type"]
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_endpoints_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      work_checklist_items: {
        Row: {
          created_at: string
          created_by: string | null
          done: boolean
          done_at: string | null
          done_by: string | null
          id: string
          label: string
          position: number
          updated_at: string
          work_item_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          done?: boolean
          done_at?: string | null
          done_by?: string | null
          id?: string
          label: string
          position?: number
          updated_at?: string
          work_item_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          done?: boolean
          done_at?: string | null
          done_by?: string | null
          id?: string
          label?: string
          position?: number
          updated_at?: string
          work_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_checklist_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_checklist_items_done_by_fkey"
            columns: ["done_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_checklist_items_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_attention"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_checklist_items_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id"]
          },
        ]
      }
      work_item_blockers: {
        Row: {
          blocked_by_id: string | null
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          reason: string | null
          resolved_at: string | null
          responsible: string | null
          work_item_id: string
        }
        Insert: {
          blocked_by_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          reason?: string | null
          resolved_at?: string | null
          responsible?: string | null
          work_item_id: string
        }
        Update: {
          blocked_by_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          reason?: string | null
          resolved_at?: string | null
          responsible?: string | null
          work_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_item_blockers_blocked_by_id_fkey"
            columns: ["blocked_by_id"]
            isOneToOne: false
            referencedRelation: "work_attention"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_item_blockers_blocked_by_id_fkey"
            columns: ["blocked_by_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_item_blockers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_item_blockers_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_attention"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_item_blockers_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id"]
          },
        ]
      }
      work_item_field_values: {
        Row: {
          field_id: string
          updated_at: string
          value: Json | null
          work_item_id: string
        }
        Insert: {
          field_id: string
          updated_at?: string
          value?: Json | null
          work_item_id: string
        }
        Update: {
          field_id?: string
          updated_at?: string
          value?: Json | null
          work_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_item_field_values_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "workspace_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_item_field_values_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_attention"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_item_field_values_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id"]
          },
        ]
      }
      work_items: {
        Row: {
          agency_id: string
          archived_at: string | null
          archived_reason: string | null
          assigned_to: string | null
          board_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          crm_engine_key: string | null
          crm_project_id: string | null
          crm_work_unit_template_id: string | null
          description: string | null
          division: Database["public"]["Enums"]["fulfillment_service"] | null
          due_at: string | null
          id: string
          is_fixture: boolean
          item_type_id: string | null
          organization_id: string | null
          partner_group_id: string | null
          partner_service_id: string | null
          previous_assigned_to: string | null
          priority: Database["public"]["Enums"]["work_priority"]
          qa_feedback: string | null
          qa_result: Database["public"]["Enums"]["work_qa_result"] | null
          qa_reviewed_at: string | null
          qa_reviewed_by: string | null
          related_ref: string | null
          related_type: Database["public"]["Enums"]["work_related_type"]
          scope: Database["public"]["Enums"]["work_scope"]
          stage: Database["public"]["Enums"]["work_stage"]
          status_id: string | null
          subject_organization_id: string | null
          team_id: string | null
          title: string
          updated_at: string
          waiting_note: string | null
          waiting_on: Database["public"]["Enums"]["work_waiting_reason"] | null
          waiting_since: string | null
          workspace_id: string | null
        }
        Insert: {
          agency_id: string
          archived_at?: string | null
          archived_reason?: string | null
          assigned_to?: string | null
          board_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          crm_engine_key?: string | null
          crm_project_id?: string | null
          crm_work_unit_template_id?: string | null
          description?: string | null
          division?: Database["public"]["Enums"]["fulfillment_service"] | null
          due_at?: string | null
          id?: string
          is_fixture?: boolean
          item_type_id?: string | null
          organization_id?: string | null
          partner_group_id?: string | null
          partner_service_id?: string | null
          previous_assigned_to?: string | null
          priority?: Database["public"]["Enums"]["work_priority"]
          qa_feedback?: string | null
          qa_result?: Database["public"]["Enums"]["work_qa_result"] | null
          qa_reviewed_at?: string | null
          qa_reviewed_by?: string | null
          related_ref?: string | null
          related_type: Database["public"]["Enums"]["work_related_type"]
          scope: Database["public"]["Enums"]["work_scope"]
          stage?: Database["public"]["Enums"]["work_stage"]
          status_id?: string | null
          subject_organization_id?: string | null
          team_id?: string | null
          title: string
          updated_at?: string
          waiting_note?: string | null
          waiting_on?: Database["public"]["Enums"]["work_waiting_reason"] | null
          waiting_since?: string | null
          workspace_id?: string | null
        }
        Update: {
          agency_id?: string
          archived_at?: string | null
          archived_reason?: string | null
          assigned_to?: string | null
          board_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          crm_engine_key?: string | null
          crm_project_id?: string | null
          crm_work_unit_template_id?: string | null
          description?: string | null
          division?: Database["public"]["Enums"]["fulfillment_service"] | null
          due_at?: string | null
          id?: string
          is_fixture?: boolean
          item_type_id?: string | null
          organization_id?: string | null
          partner_group_id?: string | null
          partner_service_id?: string | null
          previous_assigned_to?: string | null
          priority?: Database["public"]["Enums"]["work_priority"]
          qa_feedback?: string | null
          qa_result?: Database["public"]["Enums"]["work_qa_result"] | null
          qa_reviewed_at?: string | null
          qa_reviewed_by?: string | null
          related_ref?: string | null
          related_type?: Database["public"]["Enums"]["work_related_type"]
          scope?: Database["public"]["Enums"]["work_scope"]
          stage?: Database["public"]["Enums"]["work_stage"]
          status_id?: string | null
          subject_organization_id?: string | null
          team_id?: string | null
          title?: string
          updated_at?: string
          waiting_note?: string | null
          waiting_on?: Database["public"]["Enums"]["work_waiting_reason"] | null
          waiting_since?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_items_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "workspace_boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_crm_engine_key_fkey"
            columns: ["crm_engine_key"]
            isOneToOne: false
            referencedRelation: "crm_engines"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "work_items_crm_project_id_fkey"
            columns: ["crm_project_id"]
            isOneToOne: false
            referencedRelation: "crm_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_crm_work_unit_template_id_fkey"
            columns: ["crm_work_unit_template_id"]
            isOneToOne: false
            referencedRelation: "crm_work_unit_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_item_type_id_fkey"
            columns: ["item_type_id"]
            isOneToOne: false
            referencedRelation: "workspace_item_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_partner_group_id_fkey"
            columns: ["partner_group_id"]
            isOneToOne: false
            referencedRelation: "outsourcing_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_partner_service_id_fkey"
            columns: ["partner_service_id"]
            isOneToOne: false
            referencedRelation: "partner_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_previous_assigned_to_fkey"
            columns: ["previous_assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_qa_reviewed_by_fkey"
            columns: ["qa_reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "workspace_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_subject_organization_id_fkey"
            columns: ["subject_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_boards: {
        Row: {
          archived_at: string | null
          created_at: string
          id: string
          name: string
          position: number
          view_kind: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          id?: string
          name: string
          position?: number
          view_kind?: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          id?: string
          name?: string
          position?: number
          view_kind?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_boards_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_fields: {
        Row: {
          archived_at: string | null
          field_type: string
          id: string
          key: string
          label: string
          options: Json | null
          position: number
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          field_type: string
          id?: string
          key: string
          label: string
          options?: Json | null
          position?: number
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          field_type?: string
          id?: string
          key?: string
          label?: string
          options?: Json | null
          position?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_fields_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_item_types: {
        Row: {
          icon: string | null
          id: string
          key: string
          label: string
          position: number
          workspace_id: string
        }
        Insert: {
          icon?: string | null
          id?: string
          key: string
          label: string
          position?: number
          workspace_id: string
        }
        Update: {
          icon?: string | null
          id?: string
          key?: string
          label?: string
          position?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_item_types_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_shares: {
        Row: {
          access: string
          board_id: string | null
          created_at: string
          created_by: string | null
          engagement_id: string
          id: string
          revoked_at: string | null
          workspace_id: string
        }
        Insert: {
          access?: string
          board_id?: string | null
          created_at?: string
          created_by?: string | null
          engagement_id: string
          id?: string
          revoked_at?: string | null
          workspace_id: string
        }
        Update: {
          access?: string
          board_id?: string | null
          created_at?: string
          created_by?: string | null
          engagement_id?: string
          id?: string
          revoked_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_shares_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "workspace_boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_shares_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_shares_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "fulfillment_engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_shares_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_statuses: {
        Row: {
          canonical_stage: Database["public"]["Enums"]["work_stage"]
          colour: string | null
          id: string
          is_terminal: boolean
          key: string
          label: string
          position: number
          workspace_id: string
        }
        Insert: {
          canonical_stage?: Database["public"]["Enums"]["work_stage"]
          colour?: string | null
          id?: string
          is_terminal?: boolean
          key: string
          label: string
          position?: number
          workspace_id: string
        }
        Update: {
          canonical_stage?: Database["public"]["Enums"]["work_stage"]
          colour?: string | null
          id?: string
          is_terminal?: boolean
          key?: string
          label?: string
          position?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_statuses_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          agency_id: string | null
          archived_at: string | null
          colour: string | null
          created_at: string
          created_by: string | null
          description: string | null
          icon: string | null
          id: string
          name: string
          organization_id: string | null
          partner_group_id: string | null
          partner_service_id: string | null
          updated_at: string
        }
        Insert: {
          agency_id?: string | null
          archived_at?: string | null
          colour?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          organization_id?: string | null
          partner_group_id?: string | null
          partner_service_id?: string | null
          updated_at?: string
        }
        Update: {
          agency_id?: string | null
          archived_at?: string | null
          colour?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          organization_id?: string | null
          partner_group_id?: string | null
          partner_service_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspaces_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspaces_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspaces_partner_group_id_fkey"
            columns: ["partner_group_id"]
            isOneToOne: false
            referencedRelation: "outsourcing_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspaces_partner_service_id_fkey"
            columns: ["partner_service_id"]
            isOneToOne: false
            referencedRelation: "partner_services"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      borrower_funding_files: {
        Row: {
          agency_id: string | null
          id: string | null
          last_activity_at: string | null
          organization_id: string | null
          public_id: string | null
          purpose: string | null
          requested_amount: number | null
          secondary_status:
            | Database["public"]["Enums"]["funding_secondary_status"]
            | null
          stage: Database["public"]["Enums"]["funding_pipeline_stage"] | null
          waiting_on: Database["public"]["Enums"]["funding_waiting_on"] | null
        }
        Relationships: [
          {
            foreignKeyName: "funding_clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_files_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      fixture_login_state: {
        Row: {
          fixture_identities: number | null
          identity_rows: number | null
          live_sessions: number | null
          not_banned: number | null
          with_password: number | null
        }
        Relationships: []
      }
      report_facts: {
        Row: {
          agency_id: string | null
          amount: number | null
          client_id: string | null
          department: string | null
          employee_id: string | null
          fact_date: string | null
          funding_file_id: string | null
          minutes: number | null
          organization_id: string | null
          outcome: string | null
          outsourcing_group_id: string | null
          quantity: number | null
          service: string | null
          source: string | null
          status_from: string | null
          status_to: string | null
          unit: string | null
        }
        Relationships: []
      }
      report_item_changes: {
        Row: {
          account_ref: string | null
          bureaus: string[] | null
          change: string | null
          client_id: string | null
          current_balance_cents: number | null
          current_status: string | null
          kind: string | null
          name: string | null
          observed_on: string | null
          prev_report_id: string | null
          previous_balance_cents: number | null
          previous_status: string | null
          report_id: string | null
        }
        Relationships: []
      }
      work_attention: {
        Row: {
          agency_id: string | null
          assigned_to: string | null
          attention_reason: string | null
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          division: Database["public"]["Enums"]["fulfillment_service"] | null
          due_at: string | null
          hours_remaining: number | null
          id: string | null
          organization_id: string | null
          priority: Database["public"]["Enums"]["work_priority"] | null
          related_ref: string | null
          related_type: Database["public"]["Enums"]["work_related_type"] | null
          scope: Database["public"]["Enums"]["work_scope"] | null
          stage: Database["public"]["Enums"]["work_stage"] | null
          subject_organization_id: string | null
          team_id: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          agency_id?: string | null
          assigned_to?: string | null
          attention_reason?: never
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          division?: Database["public"]["Enums"]["fulfillment_service"] | null
          due_at?: string | null
          hours_remaining?: never
          id?: string | null
          organization_id?: string | null
          priority?: Database["public"]["Enums"]["work_priority"] | null
          related_ref?: string | null
          related_type?: Database["public"]["Enums"]["work_related_type"] | null
          scope?: Database["public"]["Enums"]["work_scope"] | null
          stage?: Database["public"]["Enums"]["work_stage"] | null
          subject_organization_id?: string | null
          team_id?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          agency_id?: string | null
          assigned_to?: string | null
          attention_reason?: never
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          division?: Database["public"]["Enums"]["fulfillment_service"] | null
          due_at?: string | null
          hours_remaining?: never
          id?: string | null
          organization_id?: string | null
          priority?: Database["public"]["Enums"]["work_priority"] | null
          related_ref?: string | null
          related_type?: Database["public"]["Enums"]["work_related_type"] | null
          scope?: Database["public"]["Enums"]["work_scope"] | null
          stage?: Database["public"]["Enums"]["work_stage"] | null
          subject_organization_id?: string | null
          team_id?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_items_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_subject_organization_id_fkey"
            columns: ["subject_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_agency_invitation: { Args: { p_token: string }; Returns: string }
      accept_invitation: { Args: { p_token: string }; Returns: string }
      access_capabilities_for_user: {
        Args: { p_user: string }
        Returns: {
          allowed: boolean
          key: string
          label: string
          module: string
          security_relevant: boolean
          source: string
        }[]
      }
      access_profile_for_user: { Args: { p_user: string }; Returns: Json }
      acknowledge_policy_update: {
        Args: { p_update: string }
        Returns: undefined
      }
      activity_service: {
        Args: { p_entity_type: string }
        Returns: Database["public"]["Enums"]["fulfillment_service"]
      }
      add_deal_stipulation: {
        Args: {
          p_deal: string
          p_document_type: string
          p_lender_note?: string
          p_party?: string
          p_period?: string
        }
        Returns: string
      }
      advance_closing: {
        Args: {
          p_closing: string
          p_note?: string
          p_status: Database["public"]["Enums"]["closing_status"]
        }
        Returns: undefined
      }
      agency_birthdays: {
        Args: { p_within_days?: number }
        Returns: {
          avatar_path: string
          birth_day: number
          birth_month: number
          days_away: number
          name: string
          user_id: string
        }[]
      }
      agency_can: { Args: { p_key: string }; Returns: boolean }
      agency_can_for_user: {
        Args: { p_key: string; p_user: string }
        Returns: {
          allowed: boolean
          source: string
        }[]
      }
      agency_of_org: { Args: { p_org: string }; Returns: string }
      agency_positions: {
        Args: { p_agency: string }
        Returns: {
          archived_at: string
          coverage: Json
          department_id: string
          department_name: string
          description: string
          division_id: string
          division_name: string
          division_parent_id: string
          division_tier: string
          headcount: number
          holders: Json
          id: string
          reports_to_id: string
          reports_to_person: string
          reports_to_title: string
          sort: number
          state: string
          status: string
          team_id: string
          team_name: string
          title: string
        }[]
      }
      ai_available_credits: { Args: { p_org: string }; Returns: number }
      ai_can_use: {
        Args: { p_feature: string; p_org: string }
        Returns: boolean
      }
      ai_credit_balance: { Args: { p_org: string }; Returns: number }
      ai_economics: {
        Args: { p_from?: string; p_to?: string }
        Returns: {
          credits_charged: number
          feature_key: string
          gross_margin_cents: number
          input_tokens: number
          model: string
          organization_id: string
          organization_name: string
          output_tokens: number
          plan_key: string
          provider_cost_cents: number
          requests: number
        }[]
      }
      ai_estimate_credits: {
        Args: { p_input: number; p_model: string; p_output: number }
        Returns: number
      }
      ai_limits_for: {
        Args: { p_org: string }
        Returns: {
          daily_spend_cap_credits: number
          id: string
          max_output_tokens: number
          max_pages: number
          max_upload_mb: number
          organization_id: string | null
          per_request_cap_credits: number
          requests_per_hour: number
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "ai_limits"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ai_my_usage: {
        Args: { p_from?: string; p_org: string }
        Returns: {
          credits_charged: number
          feature_key: string
          requests: number
        }[]
      }
      ai_pricing_unconfirmed: {
        Args: never
        Returns: {
          effective_from: string
          model: string
          source_note: string
        }[]
      }
      ai_reconcile: {
        Args: {
          p_cached: number
          p_input: number
          p_output: number
          p_request_id: string
          p_reservation: string
        }
        Returns: {
          balance: number
          credits_charged: number
        }[]
      }
      ai_record_usage: {
        Args: {
          p_cached: number
          p_feature: string
          p_input: number
          p_model: string
          p_org: string
          p_output: number
          p_product?: Database["public"]["Enums"]["product_key"]
          p_request_id: string
          p_user: string
        }
        Returns: {
          balance: number
          credits_charged: number
          provider_cost_cents: number
        }[]
      }
      ai_release: { Args: { p_reservation: string }; Returns: undefined }
      ai_reserve: {
        Args: {
          p_est_input: number
          p_est_output: number
          p_feature: string
          p_model: string
          p_org: string
        }
        Returns: {
          available_after: number
          estimated_credits: number
          reservation_id: string
        }[]
      }
      ai_reserved_credits: { Args: { p_org: string }; Returns: number }
      ai_spend_today: { Args: { p_org: string }; Returns: number }
      announcement_notifiable: {
        Args: { p_announcement: string; p_user: string }
        Returns: boolean
      }
      approve_dispute_letter: { Args: { p_letter: string }; Returns: undefined }
      archive_announcement: { Args: { p_id: string }; Returns: undefined }
      archive_knowledge_article: { Args: { p_id: string }; Returns: undefined }
      archive_organization_department: {
        Args: { p_id: string }
        Returns: undefined
      }
      archive_partner: {
        Args: { p_group: string; p_reason?: string }
        Returns: Json
      }
      as_uuid: { Args: { p: string }; Returns: string }
      assert_fixture_logins_disabled: { Args: never; Returns: Json }
      assert_seat_available: {
        Args: { p_for_user?: string; p_ignore_pending?: boolean; p_org: string }
        Returns: undefined
      }
      assignable_profiles: {
        Args: {
          p_org?: string
          p_scope: Database["public"]["Enums"]["work_scope"]
        }
        Returns: {
          email: string
          full_name: string
          id: string
          role: string
        }[]
      }
      attribute_referral: {
        Args: { p_client: string; p_code: string }
        Returns: string
      }
      begin_letter_mailing: {
        Args: { p_from: Json; p_letter: string; p_to: Json }
        Returns: string
      }
      bes_engaged_with: { Args: { p_org: string }; Returns: boolean }
      bes_holds_partner: { Args: { p_group: string }; Returns: boolean }
      bes_may_fulfil: {
        Args: {
          p_group: string
          p_org: string
          p_service: Database["public"]["Enums"]["fulfillment_service"]
        }
        Returns: boolean
      }
      bootstrap_agency_owner: {
        Args: { p_agency_slug?: string; p_email: string }
        Returns: string
      }
      can_preview_as_user: { Args: never; Returns: boolean }
      can_see_partner: { Args: { p_group: string }; Returns: boolean }
      can_view_activity: {
        Args: {
          p_agency: string
          p_entity_type: string
          p_org: string
          p_visibility: Database["public"]["Enums"]["activity_visibility"]
        }
        Returns: boolean
      }
      can_view_fulfillment_client: { Args: { p_org: string }; Returns: boolean }
      can_view_funding_client: { Args: { p_org: string }; Returns: boolean }
      can_view_org: { Args: { p_org: string }; Returns: boolean }
      can_view_work: {
        Args: {
          p_org: string
          p_scope: Database["public"]["Enums"]["work_scope"]
          p_subject_org: string
        }
        Returns: boolean
      }
      can_write_work: {
        Args: {
          p_org: string
          p_scope: Database["public"]["Enums"]["work_scope"]
        }
        Returns: boolean
      }
      can_write_work_item: { Args: { p_item: string }; Returns: boolean }
      cancel_agency_invitation: { Args: { p_id: string }; Returns: undefined }
      cancel_partner_service: {
        Args: { p_effective?: string; p_reason?: string; p_service: string }
        Returns: Json
      }
      cancel_subscription: {
        Args: { p_immediately?: boolean; p_org: string }
        Returns: undefined
      }
      channel_auditable: { Args: { p_channel: string }; Returns: boolean }
      channel_manager: { Args: { p_channel: string }; Returns: boolean }
      channel_member_of: { Args: { p_channel: string }; Returns: boolean }
      channel_mentionable: {
        Args: { p_channel: string }
        Returns: {
          email: string
          hint: string
          name: string
          user_id: string
        }[]
      }
      channel_message_by_id: {
        Args: { p_id: number }
        Returns: {
          announcement_body: string
          announcement_id: string
          announcement_published_at: string
          announcement_title: string
          attachments: Json
          author_id: string
          author_is_bes: boolean
          author_name: string
          body_text: string
          channel_id: string
          created_at: string
          deleted: boolean
          edited_at: string
          id: number
          last_reply_at: string
          mentions: Json
          message_type: string
          parent_message_id: number
          pinned: boolean
          reactions: Json
          reply_count: number
          reply_to_author: string
          reply_to_id: number
          reply_to_text: string
        }[]
      }
      channel_messages: {
        Args: { p_channel: string; p_limit?: number }
        Returns: {
          announcement_body: string
          announcement_id: string
          announcement_published_at: string
          announcement_title: string
          attachments: Json
          author_id: string
          author_is_bes: boolean
          author_name: string
          body_text: string
          channel_id: string
          created_at: string
          deleted: boolean
          edited_at: string
          id: number
          last_reply_at: string
          mentions: Json
          message_type: string
          parent_message_id: number
          pinned: boolean
          reactions: Json
          reply_count: number
          reply_to_author: string
          reply_to_id: number
          reply_to_text: string
        }[]
      }
      channel_notice: {
        Args: { p_channel: string }
        Returns: Record<string, unknown>
      }
      channel_notifiable: {
        Args: { p_channel: string; p_user: string }
        Returns: boolean
      }
      channel_service_ok: { Args: { p_channel: string }; Returns: boolean }
      channel_shared_with_bes: { Args: { p_channel: string }; Returns: boolean }
      channel_visible: { Args: { p_channel: string }; Returns: boolean }
      channel_writable: { Args: { p_channel: string }; Returns: boolean }
      channels_visible_to_user: {
        Args: { p_user: string }
        Returns: {
          allowed: boolean
          channel_id: string
          name: string
          owner_kind: string
        }[]
      }
      choose_subscription_plan: {
        Args: {
          p_interval?: string
          p_org: string
          p_plan_key: string
          p_seats?: number
        }
        Returns: string
      }
      clear_agency_permission: {
        Args: { p_key: string; p_membership: string }
        Returns: undefined
      }
      client_birthdays: {
        Args: { p_org: string; p_within_days?: number }
        Returns: {
          birth_day: number
          birth_month: number
          client_id: string
          days_away: number
          name: string
        }[]
      }
      client_department_writable: {
        Args: { p_client: string }
        Returns: boolean
      }
      client_portal_home: {
        Args: never
        Returns: {
          client_id: string
          credit_round: string
          credit_status: string
          diy_identity_theft: boolean
          diy_round: number
          diy_stage: string
          full_name: string
          funding_status: string
          has_creditops: boolean
          has_diy: boolean
          has_fundingops: boolean
          open_document_requests: number
          open_funding_files: number
          organization_name: string
          presented_offers: number
          public_id: string
          published_updates: number
        }[]
      }
      client_visible: { Args: { p_client: string }; Returns: boolean }
      client_writable: {
        Args: { p_agency: string; p_group: string; p_org: string }
        Returns: boolean
      }
      commission_list: {
        Args: never
        Returns: {
          basis: string
          basis_amount: number
          computed_amount: number
          deal_id: string
          funded_at: string
          funded_deal_id: string
          id: string
          paid_at: string
          party_id: string
          party_name: string
          payment_reference: string
          rate_or_amount: number
          revenue_confirmed: boolean
          state: string
        }[]
      }
      commission_org: { Args: { p_commission: string }; Returns: string }
      commission_plan_for: {
        Args: {
          p_on: string
          p_org: string
          p_party: string
          p_party_kind: string
        }
        Returns: {
          applies_to: string
          basis: string
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          label: string
          organization_id: string
          party_id: string | null
          party_kind: string
          rate_or_amount: number
        }
        SetofOptions: {
          from: "*"
          to: "commission_plans"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_letter_mailing: {
        Args: {
          p_cost_cents?: number
          p_error?: string
          p_expected?: string
          p_mailing: string
          p_mode?: string
          p_provider_id?: string
          p_status: Database["public"]["Enums"]["mailing_status"]
          p_tracking?: string
        }
        Returns: undefined
      }
      compute_commissions_for_deal: {
        Args: { p_funded_deal: string }
        Returns: number
      }
      confirm_deal_revenue: {
        Args: { p_amount: number; p_funded_deal: string }
        Returns: number
      }
      confirm_funding: {
        Args: {
          p_closing: string
          p_funded_at: string
          p_gross: number
          p_net: number
          p_note?: string
          p_reference?: string
        }
        Returns: string
      }
      connect_ghl_agency: {
        Args: {
          p_company_id: string
          p_expires_at?: string
          p_refresh_token?: string
          p_token: string
          p_token_kind?: string
          p_webhook_secret?: string
        }
        Returns: undefined
      }
      connect_ghl_location: {
        Args: {
          p_label: string
          p_location_id: string
          p_org: string
          p_token: string
          p_webhook_secret: string
        }
        Returns: string
      }
      copy_member_permissions: {
        Args: { p_copy_scope?: boolean; p_from: string; p_to: string }
        Returns: undefined
      }
      create_agency_channel: {
        Args: {
          p_kind?: string
          p_name: string
          p_open_to_scope?: boolean
          p_purpose?: string
          p_team_ids?: string[]
          p_user_ids?: string[]
        }
        Returns: string
      }
      create_credit_report: {
        Args: {
          p_bureaus: string[]
          p_client: string
          p_completeness?: Json
          p_consumer: string
          p_file: string
          p_group: string
          p_items: Json
          p_org: string
          p_parser_version: string
          p_pulled_at: string
          p_reconciliation?: Json
          p_scores: Json
          p_source: string
        }
        Returns: string
      }
      create_renewal_file: {
        Args: {
          p_purpose: string
          p_renewal: string
          p_requested_amount: number
        }
        Returns: string
      }
      credit_client_visible: { Args: { p_client: string }; Returns: boolean }
      credit_client_writable: { Args: { p_client: string }; Returns: boolean }
      credit_report_visible: {
        Args: { p_client: string; p_consumer: string; p_org: string }
        Returns: boolean
      }
      creditops_department_statuses: {
        Args: {
          p_department: Database["public"]["Enums"]["fulfillment_department"]
        }
        Returns: string[]
      }
      crm_add_engine: {
        Args: { p_engine: string; p_project: string }
        Returns: number
      }
      crm_cancel_engine: {
        Args: { p_engine: string; p_project: string; p_reason: string }
        Returns: number
      }
      crm_complete_milestone: {
        Args: { p_link?: string; p_milestone: string; p_note?: string }
        Returns: undefined
      }
      crm_complete_work_unit: {
        Args: {
          p_actions?: string[]
          p_handoff_team?: string
          p_handoff_to?: string
          p_keep_open?: boolean
          p_note?: string
          p_targets?: string[]
          p_unit: string
        }
        Returns: Json
      }
      crm_create_project: {
        Args: {
          p_engines: string[]
          p_lead?: string
          p_name: string
          p_organization?: string
          p_partner_group?: string
          p_partner_service?: string
          p_preset?: string
          p_started_on?: string
          p_target_go_live?: string
          p_team?: string
        }
        Returns: string
      }
      crm_engine_state: {
        Args: { p_engine: string; p_project: string }
        Returns: string
      }
      crm_fail_qa: {
        Args: { p_feedback: string; p_unit: string }
        Returns: undefined
      }
      crm_instantiate_engine: {
        Args: { p_engine: string; p_project: string; p_template: string }
        Returns: number
      }
      crm_instantiate_milestones: {
        Args: { p_engines: string[]; p_project: string }
        Returns: number
      }
      crm_pass_qa: { Args: { p_note?: string; p_unit: string }; Returns: Json }
      crm_project_board: {
        Args: never
        Returns: {
          blocked: number
          engines: string[]
          health: string
          id: string
          in_qa: number
          journey: string
          lead_name: string
          name: string
          next_milestone: string
          open_units: number
          organization_id: string
          overdue: number
          partner_name: string
          progress: number
          target_go_live: string
          waiting_client: number
        }[]
      }
      crm_project_engine_progress: {
        Args: { p_project: string }
        Returns: {
          blocked: number
          cancelled: boolean
          completed: number
          engine_key: string
          in_progress: number
          label: string
          percent: number
          planned: number
          qa: number
          ready: number
          state: string
          units: number
          waiting: number
        }[]
      }
      crm_project_health: { Args: { p_project: string }; Returns: string }
      crm_project_journey: { Args: { p_project: string }; Returns: string }
      crm_project_progress: { Args: { p_project: string }; Returns: number }
      crm_project_readable: { Args: { p_project: string }; Returns: boolean }
      crm_project_writable: { Args: { p_project: string }; Returns: boolean }
      crm_record_go_live: {
        Args: {
          p_project: string
          p_support_end?: string
          p_support_start?: string
        }
        Returns: undefined
      }
      crm_requirements_unmapped: {
        Args: { p_agency: string }
        Returns: {
          id: string
          missing: string
          source_row_ref: string
          title: string
        }[]
      }
      crm_satisfy_client_requirement: {
        Args: { p_note?: string; p_requirement: string }
        Returns: number
      }
      crm_set_waiting: {
        Args: {
          p_note?: string
          p_reason: Database["public"]["Enums"]["work_waiting_reason"]
          p_unit: string
        }
        Returns: undefined
      }
      crm_template_readable: { Args: { p_agency: string }; Returns: boolean }
      crm_template_writable: { Args: { p_agency: string }; Returns: boolean }
      crm_work_unit_ready: { Args: { p_unit: string }; Returns: boolean }
      crm_work_unit_state: { Args: { p_unit: string }; Returns: string }
      current_agency_role: {
        Args: never
        Returns: Database["public"]["Enums"]["agency_role"]
      }
      deal_status_for_decision: {
        Args: {
          p_decision: Database["public"]["Enums"]["lender_decision_kind"]
        }
        Returns: Database["public"]["Enums"]["funding_deal_status"]
      }
      default_role_access: {
        Args: {
          p_product: Database["public"]["Enums"]["product_key"]
          p_role: Database["public"]["Enums"]["org_role"]
        }
        Returns: {
          can_access_management: boolean
          can_edit_progress: boolean
          can_log_work: boolean
          departments: string[]
          views: string[]
        }[]
      }
      default_scope_for_role: {
        Args: { p_role: Database["public"]["Enums"]["agency_role"] }
        Returns: Database["public"]["Enums"]["access_scope"]
      }
      delete_client_document: { Args: { p_id: string }; Returns: string }
      delete_company_document: { Args: { p_id: string }; Returns: string }
      delete_hub_tool: { Args: { p_id: string }; Returns: undefined }
      delete_own_message: { Args: { p_id: number }; Returns: undefined }
      department_leads: {
        Args: { p_agency: string; p_departments: string[] }
        Returns: string[]
      }
      dev_seed_user: {
        Args: { p_email: string; p_full_name: string; p_password: string }
        Returns: string
      }
      dev_uuid: { Args: { p_key: string }; Returns: string }
      disconnect_ghl_agency: { Args: never; Returns: undefined }
      disconnect_ghl_location: {
        Args: { p_location_id: string }
        Returns: undefined
      }
      diy_advance: {
        Args: {
          p_client: string
          p_stage: Database["public"]["Enums"]["diy_stage"]
        }
        Returns: undefined
      }
      diy_enroll: {
        Args: {
          p_first_name: string
          p_last_name: string
          p_org: string
          p_phone?: string
        }
        Returns: string
      }
      diy_record_consent: {
        Args: {
          p_client: string
          p_kind: string
          p_statement: string
          p_version: string
        }
        Returns: string
      }
      diy_upgrade_to_managed: { Args: { p_client: string }; Returns: string }
      document_request_transition_allowed: {
        Args: {
          p_from: Database["public"]["Enums"]["document_request_status"]
          p_to: Database["public"]["Enums"]["document_request_status"]
        }
        Returns: boolean
      }
      end_position_assignment: {
        Args: { p_id: string; p_on?: string }
        Returns: undefined
      }
      engagement_is_live: {
        Args: {
          p_from: string
          p_status: Database["public"]["Enums"]["engagement_status"]
          p_to: string
        }
        Returns: boolean
      }
      ensure_default_agency_channels: {
        Args: { p_agency: string }
        Returns: undefined
      }
      ensure_general_channel: { Args: { p_org: string }; Returns: string }
      entity_visible: {
        Args: { p_entity_id: string; p_entity_type: string }
        Returns: boolean
      }
      eod_day_activity: {
        Args: { p_date: string; p_employee: string }
        Returns: Json
      }
      eod_run_cutoff: { Args: { p_agency: string }; Returns: number }
      file_bes_in_scope: { Args: { p_file: string }; Returns: boolean }
      file_org_admin: { Args: { p_file: string }; Returns: boolean }
      file_reviewer: { Args: { p_file: string }; Returns: boolean }
      find_client_across_divisions: {
        Args: { p_email: string; p_scope: string }
        Returns: {
          client_id: string
          client_name: string
          division: string
          status: string
        }[]
      }
      fulfillment_department_key: {
        Args: { p_department: string }
        Returns: string
      }
      funding_department_writable: {
        Args: { p_file: string }
        Returns: boolean
      }
      funding_event_visibility: {
        Args: { p_agency: string; p_org: string }
        Returns: Database["public"]["Enums"]["activity_visibility"]
      }
      funding_file_tenancy: {
        Args: { p_file: string }
        Returns: {
          agency_id: string
          client_id: string
          organization_id: string
        }[]
      }
      funding_file_visible: { Args: { p_file: string }; Returns: boolean }
      fundingops_department_statuses: {
        Args: {
          p_department: Database["public"]["Enums"]["funding_department"]
        }
        Returns: string[]
      }
      gen_org_public_id: { Args: never; Returns: string }
      gen_public_code: { Args: { p_prefix: string }; Returns: string }
      generate_expenses_for_month: {
        Args: { p_agency: string; p_month: number; p_year: number }
        Returns: number
      }
      ghl_agency_status: {
        Args: never
        Returns: {
          company_id: string
          connected: boolean
          expires_at: string
          has_webhook_secret: boolean
          rotated_at: string
          token_kind: string
        }[]
      }
      grant_ai_credits: {
        Args: {
          p_credits: number
          p_kind: string
          p_org: string
          p_reference?: string
        }
        Returns: string
      }
      handoff_client_departments: {
        Args: {
          p_client: string
          p_from: Database["public"]["Enums"]["fulfillment_department"]
          p_note?: string
          p_statuses: string[]
          p_targets: Database["public"]["Enums"]["fulfillment_department"][]
        }
        Returns: Json
      }
      handoff_to_creditops: {
        Args: { p_existing_client?: string; p_funding_client: string }
        Returns: string
      }
      handoff_to_fundingops: {
        Args: { p_fulfillment_client: string }
        Returns: string
      }
      hub_module_active: {
        Args: { p_module: string; p_org: string }
        Returns: boolean
      }
      hub_package_entitled: {
        Args: {
          p_org: string
          p_package: Database["public"]["Enums"]["product_key"]
        }
        Returns: boolean
      }
      in_scope: {
        Args: {
          p_agency: string
          p_assignee: string
          p_creator: string
          p_division: Database["public"]["Enums"]["fulfillment_service"]
          p_team: string
        }
        Returns: boolean
      }
      intranet_may_write: { Args: { p_org: string }; Returns: boolean }
      invitation_preview: {
        Args: { p_token: string }
        Returns: {
          email: string
          expires_at: string
          kind: string
        }[]
      }
      invite_agency_member: {
        Args: {
          p_email: string
          p_role: Database["public"]["Enums"]["agency_role"]
        }
        Returns: string
      }
      invite_team_member: {
        Args: {
          p_assigned_only?: boolean
          p_email: string
          p_org: string
          p_role: Database["public"]["Enums"]["org_role"]
        }
        Returns: string
      }
      is_admin_of: { Args: { p_agency: string }; Returns: boolean }
      is_agency_admin: { Args: never; Returns: boolean }
      is_agency_manager_or_above: { Args: never; Returns: boolean }
      is_agency_staff: { Args: never; Returns: boolean }
      is_borrower_of_file: { Args: { p_file: string }; Returns: boolean }
      is_client_of: { Args: { p_client: string }; Returns: boolean }
      is_external_member: { Args: { p_org: string }; Returns: boolean }
      is_lender_for_file: { Args: { p_file: string }; Returns: boolean }
      is_manager_of: { Args: { p_agency: string }; Returns: boolean }
      is_member_of_team: { Args: { p_team: string }; Returns: boolean }
      is_org_admin: { Args: { p_org: string }; Returns: boolean }
      is_org_member: { Args: { p_org: string }; Returns: boolean }
      is_org_owner_admin: { Args: { p_org: string }; Returns: boolean }
      is_owner_of: { Args: { p_agency: string }; Returns: boolean }
      is_partner_contact_of: { Args: { p_group: string }; Returns: boolean }
      is_portal_client: { Args: never; Returns: boolean }
      is_staff_of: { Args: { p_agency: string }; Returns: boolean }
      is_team_lead_of: { Args: { p_team: string }; Returns: boolean }
      kpi_match_sql: { Args: { p_match: Json }; Returns: string }
      lender_editable: { Args: { p_lender: string }; Returns: boolean }
      lender_visible: { Args: { p_lender: string }; Returns: boolean }
      letter_prohibited_phrase: { Args: { p_body: string }; Returns: string }
      letter_template_editable: {
        Args: { p_agency: string; p_org: string }
        Returns: boolean
      }
      letter_template_visible: {
        Args: { p_agency: string; p_org: string }
        Returns: boolean
      }
      log_audit: {
        Args: {
          p_action: string
          p_after?: Json
          p_before?: Json
          p_entity_id: string
          p_entity_type: string
          p_org?: string
        }
        Returns: undefined
      }
      looks_like_a_secret: { Args: { p_text: string }; Returns: boolean }
      manager_of: { Args: { p_user: string }; Returns: string }
      map_ghl_location: {
        Args: { p_location_id: string; p_org: string }
        Returns: undefined
      }
      mark_channel_read: {
        Args: { p_at?: string; p_channel: string }
        Returns: undefined
      }
      mark_commission_paid: {
        Args: { p_commission: string; p_reference: string }
        Returns: undefined
      }
      mark_letter_mailed: {
        Args: { p_letter: string; p_mailed_at?: string }
        Returns: undefined
      }
      mark_overdue_expenses: { Args: never; Returns: number }
      mark_overdue_invoices: { Args: never; Returns: number }
      may_notify_mention: {
        Args: {
          p_agency: string
          p_org: string
          p_user: string
          p_visibility: Database["public"]["Enums"]["activity_visibility"]
        }
        Returns: boolean
      }
      member_can: { Args: { p_key: string; p_org: string }; Returns: boolean }
      member_first_run: {
        Args: never
        Returns: {
          avatar_set: boolean
          birthday_shared: boolean
          phone_set: boolean
          preferred_name_set: boolean
        }[]
      }
      mentioned_user_ids: { Args: { p_body: Json }; Returns: string[] }
      merge_agency_branding: {
        Args: { p_agency: string; p_patch: Json }
        Returns: Json
      }
      merge_organization_branding: {
        Args: { p_org: string; p_patch: Json }
        Returns: Json
      }
      merge_organization_workspace_views: {
        Args: { p_org: string; p_patch: Json }
        Returns: Json
      }
      message_guard_hit: {
        Args: { p_agency: string; p_text: string }
        Returns: string
      }
      message_mentions: { Args: { p_body: Json }; Returns: Json }
      move_document_request: {
        Args: {
          p_note?: string
          p_request: string
          p_status: Database["public"]["Enums"]["document_request_status"]
        }
        Returns: undefined
      }
      move_funding_file: {
        Args: {
          p_file: string
          p_note?: string
          p_secondary?: Database["public"]["Enums"]["funding_secondary_status"]
          p_stage?: Database["public"]["Enums"]["funding_pipeline_stage"]
          p_waiting_on?: Database["public"]["Enums"]["funding_waiting_on"]
        }
        Returns: undefined
      }
      my_agency_id: { Args: never; Returns: string }
      my_client_ids: { Args: never; Returns: string[] }
      my_org_ids: { Args: never; Returns: string[] }
      my_permissions: {
        Args: { p_org: string }
        Returns: {
          allowed: boolean
          key: string
        }[]
      }
      next_invoice_number: { Args: { p_agency: string }; Returns: string }
      normalize_business_name: { Args: { p: string }; Returns: string }
      normalize_phone: { Args: { p: string }; Returns: string }
      notify_mentions: {
        Args: {
          p_activity: Database["public"]["Tables"]["activity_events"]["Row"]
        }
        Returns: undefined
      }
      open_direct_channel: { Args: { p_other: string }; Returns: string }
      open_dispute_round: {
        Args: {
          p_client: string
          p_reset_cycle: boolean
          p_strategy: Database["public"]["Enums"]["dispute_strategy"]
        }
        Returns: string
      }
      org_agency: { Args: { p_org: string }; Returns: string }
      org_entitled: {
        Args: { p_org: string; p_product: string }
        Returns: boolean
      }
      org_has_product: {
        Args: {
          p_org: string
          p_product: Database["public"]["Enums"]["product_key"]
        }
        Returns: boolean
      }
      org_role_for: {
        Args: { p_org: string }
        Returns: Database["public"]["Enums"]["org_role"]
      }
      org_scope_allows: {
        Args: { p_assignee: string; p_org: string }
        Returns: boolean
      }
      organization_active_records: { Args: { p_org: string }; Returns: number }
      organization_directory: {
        Args: { p_org: string }
        Returns: {
          avatar_path: string
          birth_day: number
          birth_month: number
          department_id: string
          department_name: string
          email: string
          job_title: string
          membership_id: string
          name: string
          phone: string
          platform_role: Database["public"]["Enums"]["org_role"]
          preferred_name: string
          since: string
          user_id: string
        }[]
      }
      organization_first_run: {
        Args: { p_org: string }
        Returns: {
          automations: number
          branding_set: boolean
          clients: number
          credit_reports: number
          funding_files: number
          hub_choices: number
          kpis_chosen: number
          letter_templates: number
          teammates: number
        }[]
      }
      organization_hub: {
        Args: { p_org: string }
        Returns: {
          active: boolean
          always_on: boolean
          backed_by: string
          description: string
          enabled: boolean
          entitled: boolean
          key: string
          label: string
          package: Database["public"]["Enums"]["product_key"]
          sort: number
          status: Database["public"]["Enums"]["hub_module_status"]
        }[]
      }
      organization_seat_detail: {
        Args: { p_org: string }
        Returns: {
          counts: boolean
          email: string
          full_name: string
          reason: string
          role: string
          user_id: string
        }[]
      }
      organization_seat_summary: {
        Args: { p_org: string }
        Returns: {
          over_capacity: boolean
          pending_invitations: number
          seats_available: number
          seats_committed: number
          seats_included: number
          seats_used: number
          source: string
        }[]
      }
      organization_seat_usage: { Args: { p_org: string }; Returns: number }
      owner_delete_record: {
        Args: { p_id: string; p_reason?: string; p_table: string }
        Returns: Json
      }
      partner_client_counts: {
        Args: never
        Returns: {
          active_clients: number
          group_id: string
          total_clients: number
        }[]
      }
      partner_credential_archive: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      partner_credential_reveal: { Args: { p_id: string }; Returns: string }
      partner_credential_save: {
        Args: {
          p_code_destination?: string
          p_group: string
          p_id?: string
          p_label: string
          p_notes?: string
          p_platform: string
          p_rotation_due?: string
          p_secret?: string
          p_url?: string
          p_username?: string
        }
        Returns: string
      }
      partner_group_of_user: { Args: never; Returns: string }
      partner_invoice_recompute: {
        Args: { p_invoice: string }
        Returns: undefined
      }
      partners_visible_to_user: {
        Args: { p_user: string }
        Returns: {
          allowed: boolean
          partner_id: string
          partner_name: string
          reason: string
        }[]
      }
      publish_holiday_announcement: {
        Args: {
          p_agency: string
          p_body: string
          p_source_key: string
          p_title: string
        }
        Returns: boolean
      }
      record_document_disposition: {
        Args: {
          p_disposition: Database["public"]["Enums"]["document_disposition"]
          p_instance: string
          p_reason?: string
        }
        Returns: undefined
      }
      record_ghl_locations: {
        Args: { p_company_id: string; p_locations: Json }
        Returns: number
      }
      record_lender_decision: {
        Args: {
          p_conditions?: string
          p_deal: string
          p_decision: Database["public"]["Enums"]["lender_decision_kind"]
          p_note?: string
          p_terms?: Json
        }
        Returns: string
      }
      record_mailing_event: {
        Args: {
          p_provider_id: string
          p_status: Database["public"]["Enums"]["mailing_status"]
          p_tracking?: string
        }
        Returns: undefined
      }
      record_owner: {
        Args: { p_entity_id: string; p_entity_type: string }
        Returns: Record<string, unknown>
      }
      record_payment_method: {
        Args: {
          p_actor: string
          p_brand: string
          p_customer_profile: string
          p_exp_month: number
          p_exp_year: number
          p_last4: string
          p_org: string
          p_payment_profile: string
        }
        Returns: string
      }
      record_payment_transaction: {
        Args: {
          p_actor: string
          p_amount_cents: number
          p_code: string
          p_description: string
          p_last4: string
          p_org: string
          p_provider_txn: string
          p_status: Database["public"]["Enums"]["payment_status"]
          p_subscription: string
          p_text: string
        }
        Returns: string
      }
      record_referral_event: {
        Args: {
          p_amount_cents?: number
          p_client: string
          p_kind: Database["public"]["Enums"]["referral_event_kind"]
          p_note?: string
        }
        Returns: string
      }
      referral_applies_to: {
        Args: { p_kind: Database["public"]["Enums"]["referral_event_kind"] }
        Returns: string
      }
      referral_list: {
        Args: { p_org: string }
        Returns: {
          attributed_at: string
          attribution_id: string
          client_id: string
          commission_earned: number
          commission_paid: number
          consumer_email: string
          consumer_name: string
          converted_credit: boolean
          converted_funding: boolean
          diy_stage: string
          signed_up: boolean
          source: string
          subscribed: boolean
        }[]
      }
      report_analysis_complete: { Args: { p_report: string }; Returns: boolean }
      report_pivot: {
        Args: {
          p_filters?: Json
          p_from?: string
          p_kpis: string[]
          p_rows: string
          p_to?: string
        }
        Returns: Json[]
      }
      require_permission: {
        Args: { p_key: string; p_org: string }
        Returns: undefined
      }
      reset_organization_role_access: {
        Args: {
          p_org: string
          p_product: Database["public"]["Enums"]["product_key"]
          p_role: Database["public"]["Enums"]["org_role"]
        }
        Returns: undefined
      }
      resolve_client_duplicate: {
        Args: { p_client: string; p_note?: string; p_outcome: string }
        Returns: undefined
      }
      restore_partner: { Args: { p_group: string }; Returns: Json }
      reverse_commission: {
        Args: { p_commission: string; p_reason: string }
        Returns: undefined
      }
      save_announcement: {
        Args: {
          p_audience: string
          p_body: string
          p_id: string
          p_org: string
          p_pinned: boolean
          p_publish: boolean
          p_tag: string
          p_title: string
        }
        Returns: string
      }
      save_client_document: {
        Args: {
          p_client: string
          p_kind?: string
          p_mime: string
          p_name: string
          p_path: string
          p_size: number
        }
        Returns: string
      }
      save_company_document: {
        Args: {
          p_mime: string
          p_name: string
          p_org: string
          p_path: string
          p_size: number
        }
        Returns: string
      }
      save_hub_tool: {
        Args: {
          p_id: string
          p_label: string
          p_note: string
          p_org: string
          p_sort: number
          p_url: string
        }
        Returns: string
      }
      save_knowledge_article: {
        Args: {
          p_audience: string
          p_body: string
          p_category: string
          p_id: string
          p_org: string
          p_publish: boolean
          p_sort: number
          p_title: string
        }
        Returns: string
      }
      save_organization_department: {
        Args: {
          p_description: string
          p_id: string
          p_lead: string
          p_name: string
          p_org: string
          p_sort: number
        }
        Returns: string
      }
      search_messages: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          author_name: string
          body_text: string
          channel_id: string
          channel_name: string
          created_at: string
          message_id: number
        }[]
      }
      services_visible_to_user: {
        Args: { p_user: string }
        Returns: {
          allowed: boolean
          partner_name: string
          reason: string
          service_id: string
          service_name: string
        }[]
      }
      set_agency_member_role: {
        Args: {
          p_membership: string
          p_role: Database["public"]["Enums"]["agency_role"]
        }
        Returns: undefined
      }
      set_agency_member_status: {
        Args: { p_membership: string; p_status: string }
        Returns: undefined
      }
      set_agency_permission: {
        Args: {
          p_allowed: boolean
          p_key: string
          p_membership: string
          p_reason?: string
        }
        Returns: undefined
      }
      set_client_department_status: {
        Args: {
          p_assignee?: string
          p_client: string
          p_department: Database["public"]["Enums"]["fulfillment_department"]
          p_note?: string
          p_status: string
        }
        Returns: undefined
      }
      set_client_lifecycle: {
        Args: {
          p_client: string
          p_lifecycle: Database["public"]["Enums"]["client_lifecycle"]
          p_reason?: string
        }
        Returns: undefined
      }
      set_funding_department_status: {
        Args: {
          p_assignee?: string
          p_department: Database["public"]["Enums"]["funding_department"]
          p_file: string
          p_note?: string
          p_status: string
        }
        Returns: undefined
      }
      set_hub_module: {
        Args: { p_enabled: boolean; p_module: string; p_org: string }
        Returns: undefined
      }
      set_member_archived: {
        Args: { p_archived: boolean; p_membership: string }
        Returns: undefined
      }
      set_member_department: {
        Args: {
          p_department: string
          p_job_title?: string
          p_membership: string
        }
        Returns: undefined
      }
      set_member_permission: {
        Args: {
          p_allowed: boolean
          p_key: string
          p_membership: string
          p_reason?: string
        }
        Returns: undefined
      }
      set_offer_status: {
        Args: {
          p_note?: string
          p_offer: string
          p_status: Database["public"]["Enums"]["offer_status"]
        }
        Returns: undefined
      }
      set_organization_automation: {
        Args: {
          p_config?: Json
          p_enabled: boolean
          p_key: string
          p_org: string
        }
        Returns: undefined
      }
      set_organization_role_access: {
        Args: {
          p_can_access_management: boolean
          p_can_edit_progress: boolean
          p_can_log_work: boolean
          p_departments: string[]
          p_org: string
          p_product: Database["public"]["Enums"]["product_key"]
          p_role: Database["public"]["Enums"]["org_role"]
          p_views: string[]
        }
        Returns: Json
      }
      set_partner_health: {
        Args: {
          p_group: string
          p_health: Database["public"]["Enums"]["partner_health"]
          p_note?: string
        }
        Returns: undefined
      }
      set_referral_code: {
        Args: { p_code: string; p_label?: string; p_org: string }
        Returns: string
      }
      shares_scope_with: { Args: { p_user: string }; Returns: boolean }
      split_person_name: {
        Args: { p_name: string }
        Returns: {
          clean: boolean
          given_name: string
          surname: string
        }[]
      }
      start_closing: {
        Args: { p_note?: string; p_offer: string }
        Returns: string
      }
      storage_channel_of: { Args: { p_name: string }; Returns: string }
      team_birthdays: {
        Args: { p_org: string; p_within_days?: number }
        Returns: {
          avatar_path: string
          birth_day: number
          birth_month: number
          days_away: number
          name: string
          user_id: string
        }[]
      }
      thread_messages: {
        Args: { p_root: number }
        Returns: {
          attachments: Json
          author_id: string
          author_is_bes: boolean
          author_name: string
          body_text: string
          created_at: string
          deleted: boolean
          edited_at: string
          id: number
          mentions: Json
          reactions: Json
        }[]
      }
      to_service: {
        Args: { p: string }
        Returns: Database["public"]["Enums"]["fulfillment_service"]
      }
      try_bigint: { Args: { t: string }; Returns: number }
      visible_channels: {
        Args: never
        Returns: {
          agency_id: string
          archived_at: string
          audit_only: boolean
          display_name: string
          id: string
          is_manager: boolean
          kind: string
          last_message_at: string
          name: string
          open_to_scope: boolean
          organization_id: string
          organization_name: string
          partner_group_id: string
          partner_name: string
          partner_service_id: string
          purpose: string
          service_name: string
          shared_with_bes: boolean
          unread: number
        }[]
      }
      workspace_reach: {
        Args: {
          p_assignee?: string
          p_board: string
          p_need_work?: boolean
          p_ws: string
        }
        Returns: boolean
      }
      workspace_view_ids: {
        Args: { p_product: Database["public"]["Enums"]["product_key"] }
        Returns: string[]
      }
    }
    Enums: {
      access_scope:
        | "agency"
        | "division"
        | "department"
        | "team"
        | "assigned"
        | "self"
      activity_visibility:
        | "bes_internal"
        | "organization_internal"
        | "shared_with_partner"
        | "client_visible"
      agency_event_kind:
        | "us_federal_holiday"
        | "custom_holiday"
        | "company_event"
        | "special_workday"
      agency_role:
        | "agency_owner"
        | "agency_admin"
        | "agency_manager"
        | "agency_team_lead"
        | "agency_agent"
      ai_reservation_status: "reserved" | "reconciled" | "released" | "expired"
      announcement_audience:
        | "organization"
        | "all_organizations"
        | "bes_internal"
      automated_review_status:
        | "no_issue_detected"
        | "review_recommended"
        | "potential_discrepancy"
        | "insufficient_data"
        | "processing_failed"
      channel_kind: "general" | "department" | "topic" | "direct"
      claim_tier:
        | "observed_discrepancy"
        | "procedural_demand"
        | "consumer_asserted_fact"
        | "legal_conclusion"
      client_lifecycle:
        | "active"
        | "program_completed"
        | "graduated"
        | "archived"
      client_provenance:
        | "saas_pulled"
        | "outsourcing_only"
        | "diy_converted"
        | "ghl"
        | "diy_self_serve"
      client_status: "active" | "paused" | "archived"
      closing_status:
        | "started"
        | "requirements_outstanding"
        | "awaiting_signatures"
        | "signed"
        | "funding_pending"
        | "funded"
        | "cancelled"
      completeness_state:
        | "present"
        | "explicit_not_reported"
        | "blank_in_source"
        | "bureau_not_present"
        | "not_exposed_by_provider"
        | "parse_failed"
        | "ambiguous"
        | "unknown"
      consumer_report_authorization: "authorized" | "pending" | "refused"
      deal_comm_channel: "email" | "phone" | "portal" | "meeting" | "note"
      deal_comm_direction: "outbound" | "inbound"
      decline_reason_category:
        | "personal_credit"
        | "revenue"
        | "cash_flow"
        | "time_in_business"
        | "industry"
        | "documentation"
        | "existing_debt"
        | "identity_verification"
        | "other"
        | "not_stated"
      dispute_letter_status:
        | "draft"
        | "approved"
        | "printed"
        | "mailed"
        | "responded"
        | "closed"
      dispute_origin:
        | "consumer_prepared"
        | "attorney_assisted"
        | "cro_prepared"
        | "cra_forwarded"
      dispute_outcome:
        | "bureau_confirmed_deletion"
        | "no_longer_observed"
        | "corrected"
        | "updated"
        | "unchanged"
        | "newly_reported"
        | "reappeared"
        | "unable_to_compare"
        | "ambiguous_match"
        | "result_not_available"
        | "legacy_reported_deleted"
        | "legacy_reported_updated"
        | "legacy_reported_verified"
      dispute_strategy:
        | "factual"
        | "integrity"
        | "hybrid"
        | "freeze"
        | "secondary"
      dispute_timer_kind:
        | "reinvestigation"
        | "furnisher_notice"
        | "results_notice"
        | "reinsertion_watch"
      diy_stage:
        | "enrolled"
        | "consented"
        | "report_added"
        | "data_reviewed"
        | "facts_confirmed"
        | "issues_identified"
        | "attested"
        | "plan_built"
        | "drafts_reviewed"
        | "approved"
        | "sent"
        | "awaiting_response"
        | "response_recorded"
        | "reimported"
        | "compared"
      document_disposition:
        | "pending_review"
        | "accepted"
        | "needs_correction"
        | "not_accepted"
        | "escalated"
      document_flag_code:
        | "MISSING_REQUIRED_DOCUMENT"
        | "WRONG_DOCUMENT_TYPE"
        | "UNREADABLE_DOCUMENT"
        | "MISSING_PAGE"
        | "EXPIRED_DOCUMENT"
        | "STALE_DOCUMENT"
        | "DUPLICATE_DOCUMENT"
        | "DUPLICATE_PERIOD"
        | "STATEMENT_PERIOD_GAP"
        | "NAME_MISMATCH"
        | "BUSINESS_NAME_MISMATCH"
        | "ADDRESS_MISMATCH"
        | "APPLICATION_DATA_MISMATCH"
        | "ACCOUNT_OWNERSHIP_MISMATCH"
        | "ENTITY_VERIFICATION_MISMATCH"
        | "FINANCIAL_PERIOD_MISMATCH"
        | "CALCULATION_VARIANCE"
        | "INCOME_VARIANCE"
        | "PROPERTY_DATA_MISMATCH"
        | "VIN_MISMATCH"
        | "THIRD_PARTY_RISK_SIGNAL"
        | "POSSIBLE_TAMPER_SIGNAL"
        | "INSUFFICIENT_EXTRACTION_CONFIDENCE"
        | "LENDER_SPECIFIC_EXCEPTION"
        | "COMPLIANCE_REVIEW_REQUIRED"
        | "PROCESSING_FAILURE"
      document_request_status:
        | "open"
        | "assigned"
        | "waiting_on_client"
        | "received"
        | "under_review"
        | "submitted_to_lender"
        | "satisfied"
        | "waived"
      document_requirement: "required" | "conditional"
      engagement_status: "pending" | "active" | "paused" | "ended"
      eod_state:
        | "draft"
        | "submitted"
        | "needs_clarification"
        | "reviewed"
        | "approved"
      escalation_tier: "initial" | "firm" | "aggressive"
      expense_status: "upcoming" | "due" | "paid" | "overdue" | "void"
      external_role:
        | "brm"
        | "sales_partner"
        | "referral_partner"
        | "lender"
        | "affiliate"
        | "client"
      finding_classification:
        | "observed_difference"
        | "potential_anomaly"
        | "evidence_supported_inaccuracy"
        | "potential_legal_issue"
      finding_disposition:
        | "confirmed"
        | "dismissed"
        | "needs_evidence"
        | "escalated"
      flag_human_disposition:
        | "accepted"
        | "dismissed"
        | "correction_requested"
        | "escalated"
      fulfillment_client_status:
        | "Onboarding"
        | "NEW ONBOARDING"
        | "INCOMPLETE ONBOARDING"
        | "Ready for Processing"
        | "In Processing"
        | "Ready for QA"
        | "In Dispute"
        | "Awaiting Response"
        | "Monitoring Issue"
        | "Completed"
        | "Attention"
        | "BC NEEDED"
        | "BC IN PROGRESS"
        | "BC COMPLETED"
        | "BC NOT NEEDED"
        | "LETTERS PENDING"
        | "LETTERS MAILED"
        | "CFPB FILED"
        | "FTC FILED"
        | "CM COMPLETED"
        | "SUPPORT NEW"
        | "ONBOARDING FOLLOWUP"
        | "READY FOR REIMPORT"
        | "BILLING ISSUE"
        | "WAITING CLIENT RESPONSE"
        | "ESCALATED TO MANAGEMENT"
        | "SUPPORT RESOLVED"
        | "Graduated"
        | "Archived"
        | "Ready for Round 1"
        | "Round Sent - Awaiting Results"
        | "Ready for Reimport / Review"
        | "Waiting for Partner Approval"
        | "New Client"
        | "Incomplete Onboarding"
        | "Prio Processing"
        | "For Complaints"
        | "Ready For Reimport/ Credit Update"
        | "On Hold (Non Workable)"
        | "For Partner Confirmation"
      fulfillment_department:
        | "Onboarding"
        | "Dispute"
        | "Support"
        | "Complaints"
        | "Bureau Calling"
      fulfillment_mode: "saas_pulled" | "outsourcing_only"
      fulfillment_round:
        | "Pre-Round"
        | "Round 1"
        | "Round 2"
        | "Round 3"
        | "Round 4+"
        | "Completed"
        | "Round 5"
        | "Round 6"
        | "Round 7"
        | "Round 8"
        | "Round 9"
        | "Round 10"
        | "Round 11"
        | "Round 12"
        | "Round 13"
      fulfillment_service:
        | "creditops"
        | "fundingops"
        | "bes_crm"
        | "talentops"
        | "corporate"
      funding_client_status:
        | "Onboarding"
        | "Credit Readiness"
        | "Readiness Review"
        | "Document Review"
        | "Lender Matching"
        | "Submitted"
        | "Stipulations"
        | "Offer Received"
        | "Funded"
        | "Declined"
        | "Withdrawn"
        | "Archived"
      funding_deal_status:
        | "Draft"
        | "Submitted"
        | "In Review"
        | "Stipulations"
        | "Offer Received"
        | "Funded"
        | "Declined"
        | "Withdrawn"
      funding_department:
        | "Readiness Review"
        | "Document Review"
        | "Lender Matching"
        | "Submissions"
        | "Stipulations"
        | "Offers"
        | "Funded Deals"
      funding_party_kind:
        | "person"
        | "business"
        | "owner_guarantor"
        | "property"
        | "vehicle"
        | "seller"
        | "affiliate"
      funding_pipeline_stage:
        | "New Application"
        | "Application Review"
        | "Document Collection"
        | "File Review"
        | "Needs Client Action"
        | "Ready for Funding Review"
        | "Lender Selection"
        | "Ready for Submission"
        | "Submitted"
        | "Lender Review"
        | "Additional Requirements"
        | "Conditional Approval"
        | "Offer Received"
        | "Offer Accepted"
        | "Final Approval"
        | "Funding"
        | "Funded"
      funding_provenance: "bes_saas_synced" | "agency_manual"
      funding_secondary_status:
        | "Active Funding"
        | "Funded"
        | "Not Funding Ready"
        | "No Current Program Fit"
        | "Endorsed to Readiness"
        | "Client Declined Offer"
        | "Lender Declined"
        | "Withdrawn"
        | "Unable to Contact"
        | "Duplicate"
        | "Verification Concern"
        | "Closed"
        | "Renewal Candidate"
      funding_waiting_on:
        | "Client"
        | "Internal Team"
        | "Lender"
        | "Third Party"
        | "Documents"
        | "Approval"
        | "No Action Required"
      ghl_connection_status: "connected" | "paused" | "error"
      hub_module_status: "available" | "planned"
      identity_kind:
        | "email"
        | "email_domain"
        | "phone"
        | "business_name"
        | "ein"
      import_quality: "complete" | "partial" | "review_required"
      knowledge_audience: "organization" | "consumer" | "both" | "bes_internal"
      lender_decision_kind:
        | "pending"
        | "approved"
        | "conditional"
        | "declined"
        | "withdrawn"
        | "expired"
      letter_audience:
        | "cra"
        | "furnisher"
        | "collector"
        | "secondary_bureau"
        | "cfpb"
      letter_kind:
        | "factual"
        | "integrity"
        | "dofd"
        | "mov"
        | "escalation"
        | "freeze"
        | "alternate_bureau"
        | "other"
      mailing_status:
        | "queued"
        | "submitted"
        | "in_transit"
        | "delivered"
        | "returned"
        | "failed"
        | "cancelled"
      meeting_provider: "google_meet" | "zoom"
      membership_kind: "agency" | "organization" | "external"
      offer_status:
        | "received"
        | "internal_review"
        | "ready_to_present"
        | "presented"
        | "client_considering"
        | "client_accepted"
        | "client_declined"
        | "expired"
        | "withdrawn"
      org_role:
        | "org_admin"
        | "org_manager"
        | "credit_processor"
        | "credit_qa"
        | "credit_support"
        | "credit_sales"
        | "credit_complaints"
        | "credit_bureau_caller"
        | "funding_admin"
        | "funding_manager"
        | "funding_processor"
        | "funding_doc_reviewer"
        | "funding_underwriter"
        | "funding_sales"
        | "funding_support"
      org_status: "Active" | "Pending Onboarding" | "At Risk" | "Paused"
      outcome_source:
        | "cra_result_notice"
        | "reimport_comparison"
        | "operator_review"
        | "consumer_provided_result"
        | "other"
        | "legacy_manual_entry"
      outsourcing_group_status:
        | "Active"
        | "Paused"
        | "Onboarding"
        | "Suspended"
        | "Archived"
      partner_billing_authority:
        | "bes"
        | "authorize_net_arb"
        | "ghl"
        | "paypal"
        | "manual"
      partner_billing_status:
        | "active"
        | "invoice_pending"
        | "overdue"
        | "paused"
        | "cancelled"
      partner_health: "happy" | "neutral" | "concerned" | "at_risk"
      partner_invoice_status:
        | "draft"
        | "scheduled"
        | "sent"
        | "partially_paid"
        | "paid"
        | "overdue"
        | "void"
        | "cancelled"
      partner_lifecycle:
        | "new"
        | "onboarding"
        | "active"
        | "on_hold"
        | "suspended"
        | "archived"
      partner_payment_provider:
        | "authorize_net"
        | "paypal"
        | "paypal_personal"
        | "stripe"
        | "wise"
        | "ghl"
        | "upwork"
        | "bank_transfer"
        | "other"
      partner_payment_status: "pending" | "succeeded" | "failed" | "refunded"
      partner_service_status:
        | "onboarding"
        | "active"
        | "paused"
        | "ended"
        | "pending"
        | "completed"
        | "cancelled"
      payment_status:
        | "approved"
        | "declined"
        | "error"
        | "held_for_review"
        | "voided"
        | "refunded"
      policy_change_kind:
        | "tightened"
        | "relaxed"
        | "paused"
        | "resumed"
        | "clarified"
      pricing_type:
        | "factor_rate"
        | "interest_rate"
        | "apr"
        | "fee_based"
        | "not_provided"
      product_key:
        | "creditOps"
        | "fundingOps"
        | "diyCredit"
        | "oi"
        | "crm"
        | "workspaces"
        | "talentOps"
        | "hubCore"
        | "hubOperations"
        | "hubPerformance"
        | "hubAi"
      reason_voice: "plain" | "frustrated"
      referral_event_kind:
        | "signup"
        | "subscription_active"
        | "converted_credit"
        | "converted_funding"
      renewal_status:
        | "monitoring"
        | "review_due"
        | "outreach"
        | "client_interested"
        | "new_file_created"
        | "not_pursued"
      subscription_status:
        | "trialing"
        | "active"
        | "past_due"
        | "cancelled"
        | "expired"
      trial_status: "active" | "converted" | "expired" | "blocked"
      verification_provider_kind:
        | "identity"
        | "business"
        | "bank"
        | "document"
        | "fraud_signal"
        | "credit"
      verification_status:
        | "verified"
        | "partially_verified"
        | "unable_to_verify"
        | "verification_failed"
      webhook_delivery_status: "emitted" | "failed" | "skipped"
      webhook_endpoint_type: "ghl" | "disputefox" | "generic"
      work_priority: "Normal" | "High" | "Urgent"
      work_qa_result: "pending" | "passed" | "needs_fix"
      work_related_type:
        | "credit_case"
        | "funding_deal"
        | "project"
        | "support"
        | "fulfillment"
      work_scope: "AGENCY" | "ORGANIZATION"
      work_stage:
        | "Queued"
        | "Assigned"
        | "In Processing"
        | "Ready for QA"
        | "QA Review"
        | "Completed"
        | "Blocked"
        | "Attention"
      work_waiting_reason:
        | "client"
        | "third_party"
        | "internal"
        | "approval"
        | "external_platform"
        | "other"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      access_scope: [
        "agency",
        "division",
        "department",
        "team",
        "assigned",
        "self",
      ],
      activity_visibility: [
        "bes_internal",
        "organization_internal",
        "shared_with_partner",
        "client_visible",
      ],
      agency_event_kind: [
        "us_federal_holiday",
        "custom_holiday",
        "company_event",
        "special_workday",
      ],
      agency_role: [
        "agency_owner",
        "agency_admin",
        "agency_manager",
        "agency_team_lead",
        "agency_agent",
      ],
      ai_reservation_status: ["reserved", "reconciled", "released", "expired"],
      announcement_audience: [
        "organization",
        "all_organizations",
        "bes_internal",
      ],
      automated_review_status: [
        "no_issue_detected",
        "review_recommended",
        "potential_discrepancy",
        "insufficient_data",
        "processing_failed",
      ],
      channel_kind: ["general", "department", "topic", "direct"],
      claim_tier: [
        "observed_discrepancy",
        "procedural_demand",
        "consumer_asserted_fact",
        "legal_conclusion",
      ],
      client_lifecycle: [
        "active",
        "program_completed",
        "graduated",
        "archived",
      ],
      client_provenance: [
        "saas_pulled",
        "outsourcing_only",
        "diy_converted",
        "ghl",
        "diy_self_serve",
      ],
      client_status: ["active", "paused", "archived"],
      closing_status: [
        "started",
        "requirements_outstanding",
        "awaiting_signatures",
        "signed",
        "funding_pending",
        "funded",
        "cancelled",
      ],
      completeness_state: [
        "present",
        "explicit_not_reported",
        "blank_in_source",
        "bureau_not_present",
        "not_exposed_by_provider",
        "parse_failed",
        "ambiguous",
        "unknown",
      ],
      consumer_report_authorization: ["authorized", "pending", "refused"],
      deal_comm_channel: ["email", "phone", "portal", "meeting", "note"],
      deal_comm_direction: ["outbound", "inbound"],
      decline_reason_category: [
        "personal_credit",
        "revenue",
        "cash_flow",
        "time_in_business",
        "industry",
        "documentation",
        "existing_debt",
        "identity_verification",
        "other",
        "not_stated",
      ],
      dispute_letter_status: [
        "draft",
        "approved",
        "printed",
        "mailed",
        "responded",
        "closed",
      ],
      dispute_origin: [
        "consumer_prepared",
        "attorney_assisted",
        "cro_prepared",
        "cra_forwarded",
      ],
      dispute_outcome: [
        "bureau_confirmed_deletion",
        "no_longer_observed",
        "corrected",
        "updated",
        "unchanged",
        "newly_reported",
        "reappeared",
        "unable_to_compare",
        "ambiguous_match",
        "result_not_available",
        "legacy_reported_deleted",
        "legacy_reported_updated",
        "legacy_reported_verified",
      ],
      dispute_strategy: [
        "factual",
        "integrity",
        "hybrid",
        "freeze",
        "secondary",
      ],
      dispute_timer_kind: [
        "reinvestigation",
        "furnisher_notice",
        "results_notice",
        "reinsertion_watch",
      ],
      diy_stage: [
        "enrolled",
        "consented",
        "report_added",
        "data_reviewed",
        "facts_confirmed",
        "issues_identified",
        "attested",
        "plan_built",
        "drafts_reviewed",
        "approved",
        "sent",
        "awaiting_response",
        "response_recorded",
        "reimported",
        "compared",
      ],
      document_disposition: [
        "pending_review",
        "accepted",
        "needs_correction",
        "not_accepted",
        "escalated",
      ],
      document_flag_code: [
        "MISSING_REQUIRED_DOCUMENT",
        "WRONG_DOCUMENT_TYPE",
        "UNREADABLE_DOCUMENT",
        "MISSING_PAGE",
        "EXPIRED_DOCUMENT",
        "STALE_DOCUMENT",
        "DUPLICATE_DOCUMENT",
        "DUPLICATE_PERIOD",
        "STATEMENT_PERIOD_GAP",
        "NAME_MISMATCH",
        "BUSINESS_NAME_MISMATCH",
        "ADDRESS_MISMATCH",
        "APPLICATION_DATA_MISMATCH",
        "ACCOUNT_OWNERSHIP_MISMATCH",
        "ENTITY_VERIFICATION_MISMATCH",
        "FINANCIAL_PERIOD_MISMATCH",
        "CALCULATION_VARIANCE",
        "INCOME_VARIANCE",
        "PROPERTY_DATA_MISMATCH",
        "VIN_MISMATCH",
        "THIRD_PARTY_RISK_SIGNAL",
        "POSSIBLE_TAMPER_SIGNAL",
        "INSUFFICIENT_EXTRACTION_CONFIDENCE",
        "LENDER_SPECIFIC_EXCEPTION",
        "COMPLIANCE_REVIEW_REQUIRED",
        "PROCESSING_FAILURE",
      ],
      document_request_status: [
        "open",
        "assigned",
        "waiting_on_client",
        "received",
        "under_review",
        "submitted_to_lender",
        "satisfied",
        "waived",
      ],
      document_requirement: ["required", "conditional"],
      engagement_status: ["pending", "active", "paused", "ended"],
      eod_state: [
        "draft",
        "submitted",
        "needs_clarification",
        "reviewed",
        "approved",
      ],
      escalation_tier: ["initial", "firm", "aggressive"],
      expense_status: ["upcoming", "due", "paid", "overdue", "void"],
      external_role: [
        "brm",
        "sales_partner",
        "referral_partner",
        "lender",
        "affiliate",
        "client",
      ],
      finding_classification: [
        "observed_difference",
        "potential_anomaly",
        "evidence_supported_inaccuracy",
        "potential_legal_issue",
      ],
      finding_disposition: [
        "confirmed",
        "dismissed",
        "needs_evidence",
        "escalated",
      ],
      flag_human_disposition: [
        "accepted",
        "dismissed",
        "correction_requested",
        "escalated",
      ],
      fulfillment_client_status: [
        "Onboarding",
        "NEW ONBOARDING",
        "INCOMPLETE ONBOARDING",
        "Ready for Processing",
        "In Processing",
        "Ready for QA",
        "In Dispute",
        "Awaiting Response",
        "Monitoring Issue",
        "Completed",
        "Attention",
        "BC NEEDED",
        "BC IN PROGRESS",
        "BC COMPLETED",
        "BC NOT NEEDED",
        "LETTERS PENDING",
        "LETTERS MAILED",
        "CFPB FILED",
        "FTC FILED",
        "CM COMPLETED",
        "SUPPORT NEW",
        "ONBOARDING FOLLOWUP",
        "READY FOR REIMPORT",
        "BILLING ISSUE",
        "WAITING CLIENT RESPONSE",
        "ESCALATED TO MANAGEMENT",
        "SUPPORT RESOLVED",
        "Graduated",
        "Archived",
        "Ready for Round 1",
        "Round Sent - Awaiting Results",
        "Ready for Reimport / Review",
        "Waiting for Partner Approval",
        "New Client",
        "Incomplete Onboarding",
        "Prio Processing",
        "For Complaints",
        "Ready For Reimport/ Credit Update",
        "On Hold (Non Workable)",
        "For Partner Confirmation",
      ],
      fulfillment_department: [
        "Onboarding",
        "Dispute",
        "Support",
        "Complaints",
        "Bureau Calling",
      ],
      fulfillment_mode: ["saas_pulled", "outsourcing_only"],
      fulfillment_round: [
        "Pre-Round",
        "Round 1",
        "Round 2",
        "Round 3",
        "Round 4+",
        "Completed",
        "Round 5",
        "Round 6",
        "Round 7",
        "Round 8",
        "Round 9",
        "Round 10",
        "Round 11",
        "Round 12",
        "Round 13",
      ],
      fulfillment_service: [
        "creditops",
        "fundingops",
        "bes_crm",
        "talentops",
        "corporate",
      ],
      funding_client_status: [
        "Onboarding",
        "Credit Readiness",
        "Readiness Review",
        "Document Review",
        "Lender Matching",
        "Submitted",
        "Stipulations",
        "Offer Received",
        "Funded",
        "Declined",
        "Withdrawn",
        "Archived",
      ],
      funding_deal_status: [
        "Draft",
        "Submitted",
        "In Review",
        "Stipulations",
        "Offer Received",
        "Funded",
        "Declined",
        "Withdrawn",
      ],
      funding_department: [
        "Readiness Review",
        "Document Review",
        "Lender Matching",
        "Submissions",
        "Stipulations",
        "Offers",
        "Funded Deals",
      ],
      funding_party_kind: [
        "person",
        "business",
        "owner_guarantor",
        "property",
        "vehicle",
        "seller",
        "affiliate",
      ],
      funding_pipeline_stage: [
        "New Application",
        "Application Review",
        "Document Collection",
        "File Review",
        "Needs Client Action",
        "Ready for Funding Review",
        "Lender Selection",
        "Ready for Submission",
        "Submitted",
        "Lender Review",
        "Additional Requirements",
        "Conditional Approval",
        "Offer Received",
        "Offer Accepted",
        "Final Approval",
        "Funding",
        "Funded",
      ],
      funding_provenance: ["bes_saas_synced", "agency_manual"],
      funding_secondary_status: [
        "Active Funding",
        "Funded",
        "Not Funding Ready",
        "No Current Program Fit",
        "Endorsed to Readiness",
        "Client Declined Offer",
        "Lender Declined",
        "Withdrawn",
        "Unable to Contact",
        "Duplicate",
        "Verification Concern",
        "Closed",
        "Renewal Candidate",
      ],
      funding_waiting_on: [
        "Client",
        "Internal Team",
        "Lender",
        "Third Party",
        "Documents",
        "Approval",
        "No Action Required",
      ],
      ghl_connection_status: ["connected", "paused", "error"],
      hub_module_status: ["available", "planned"],
      identity_kind: ["email", "email_domain", "phone", "business_name", "ein"],
      import_quality: ["complete", "partial", "review_required"],
      knowledge_audience: ["organization", "consumer", "both", "bes_internal"],
      lender_decision_kind: [
        "pending",
        "approved",
        "conditional",
        "declined",
        "withdrawn",
        "expired",
      ],
      letter_audience: [
        "cra",
        "furnisher",
        "collector",
        "secondary_bureau",
        "cfpb",
      ],
      letter_kind: [
        "factual",
        "integrity",
        "dofd",
        "mov",
        "escalation",
        "freeze",
        "alternate_bureau",
        "other",
      ],
      mailing_status: [
        "queued",
        "submitted",
        "in_transit",
        "delivered",
        "returned",
        "failed",
        "cancelled",
      ],
      meeting_provider: ["google_meet", "zoom"],
      membership_kind: ["agency", "organization", "external"],
      offer_status: [
        "received",
        "internal_review",
        "ready_to_present",
        "presented",
        "client_considering",
        "client_accepted",
        "client_declined",
        "expired",
        "withdrawn",
      ],
      org_role: [
        "org_admin",
        "org_manager",
        "credit_processor",
        "credit_qa",
        "credit_support",
        "credit_sales",
        "credit_complaints",
        "credit_bureau_caller",
        "funding_admin",
        "funding_manager",
        "funding_processor",
        "funding_doc_reviewer",
        "funding_underwriter",
        "funding_sales",
        "funding_support",
      ],
      org_status: ["Active", "Pending Onboarding", "At Risk", "Paused"],
      outcome_source: [
        "cra_result_notice",
        "reimport_comparison",
        "operator_review",
        "consumer_provided_result",
        "other",
        "legacy_manual_entry",
      ],
      outsourcing_group_status: [
        "Active",
        "Paused",
        "Onboarding",
        "Suspended",
        "Archived",
      ],
      partner_billing_authority: [
        "bes",
        "authorize_net_arb",
        "ghl",
        "paypal",
        "manual",
      ],
      partner_billing_status: [
        "active",
        "invoice_pending",
        "overdue",
        "paused",
        "cancelled",
      ],
      partner_health: ["happy", "neutral", "concerned", "at_risk"],
      partner_invoice_status: [
        "draft",
        "scheduled",
        "sent",
        "partially_paid",
        "paid",
        "overdue",
        "void",
        "cancelled",
      ],
      partner_lifecycle: [
        "new",
        "onboarding",
        "active",
        "on_hold",
        "suspended",
        "archived",
      ],
      partner_payment_provider: [
        "authorize_net",
        "paypal",
        "paypal_personal",
        "stripe",
        "wise",
        "ghl",
        "upwork",
        "bank_transfer",
        "other",
      ],
      partner_payment_status: ["pending", "succeeded", "failed", "refunded"],
      partner_service_status: [
        "onboarding",
        "active",
        "paused",
        "ended",
        "pending",
        "completed",
        "cancelled",
      ],
      payment_status: [
        "approved",
        "declined",
        "error",
        "held_for_review",
        "voided",
        "refunded",
      ],
      policy_change_kind: [
        "tightened",
        "relaxed",
        "paused",
        "resumed",
        "clarified",
      ],
      pricing_type: [
        "factor_rate",
        "interest_rate",
        "apr",
        "fee_based",
        "not_provided",
      ],
      product_key: [
        "creditOps",
        "fundingOps",
        "diyCredit",
        "oi",
        "crm",
        "workspaces",
        "talentOps",
        "hubCore",
        "hubOperations",
        "hubPerformance",
        "hubAi",
      ],
      reason_voice: ["plain", "frustrated"],
      referral_event_kind: [
        "signup",
        "subscription_active",
        "converted_credit",
        "converted_funding",
      ],
      renewal_status: [
        "monitoring",
        "review_due",
        "outreach",
        "client_interested",
        "new_file_created",
        "not_pursued",
      ],
      subscription_status: [
        "trialing",
        "active",
        "past_due",
        "cancelled",
        "expired",
      ],
      trial_status: ["active", "converted", "expired", "blocked"],
      verification_provider_kind: [
        "identity",
        "business",
        "bank",
        "document",
        "fraud_signal",
        "credit",
      ],
      verification_status: [
        "verified",
        "partially_verified",
        "unable_to_verify",
        "verification_failed",
      ],
      webhook_delivery_status: ["emitted", "failed", "skipped"],
      webhook_endpoint_type: ["ghl", "disputefox", "generic"],
      work_priority: ["Normal", "High", "Urgent"],
      work_qa_result: ["pending", "passed", "needs_fix"],
      work_related_type: [
        "credit_case",
        "funding_deal",
        "project",
        "support",
        "fulfillment",
      ],
      work_scope: ["AGENCY", "ORGANIZATION"],
      work_stage: [
        "Queued",
        "Assigned",
        "In Processing",
        "Ready for QA",
        "QA Review",
        "Completed",
        "Blocked",
        "Attention",
      ],
      work_waiting_reason: [
        "client",
        "third_party",
        "internal",
        "approval",
        "external_platform",
        "other",
      ],
    },
  },
} as const
