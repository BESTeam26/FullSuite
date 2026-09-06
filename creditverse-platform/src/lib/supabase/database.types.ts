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
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          branding?: Json
          created_at?: string
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          branding?: Json
          created_at?: string
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      agency_memberships: {
        Row: {
          agency_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["agency_role"]
          scope: Database["public"]["Enums"]["access_scope"]
          scope_department_id: string | null
          scope_division:
            | Database["public"]["Enums"]["fulfillment_service"]
            | null
          user_id: string
        }
        Insert: {
          agency_id: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["agency_role"]
          scope?: Database["public"]["Enums"]["access_scope"]
          scope_department_id?: string | null
          scope_division?:
            | Database["public"]["Enums"]["fulfillment_service"]
            | null
          user_id: string
        }
        Update: {
          agency_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["agency_role"]
          scope?: Database["public"]["Enums"]["access_scope"]
          scope_department_id?: string | null
          scope_division?:
            | Database["public"]["Enums"]["fulfillment_service"]
            | null
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
          archived_at: string | null
          audience: Database["public"]["Enums"]["announcement_audience"]
          body: string
          created_at: string
          created_by: string | null
          id: string
          organization_id: string | null
          pinned: boolean
          published_at: string | null
          tag: string | null
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          audience?: Database["public"]["Enums"]["announcement_audience"]
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string | null
          pinned?: boolean
          published_at?: string | null
          tag?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          audience?: Database["public"]["Enums"]["announcement_audience"]
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string | null
          pinned?: boolean
          published_at?: string | null
          tag?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      commissions: {
        Row: {
          basis: string
          computed_amount: number | null
          created_at: string
          created_by: string | null
          deal_id: string
          funded_at: string | null
          id: string
          note: string | null
          paid_at: string | null
          party_id: string
          party_kind: string
          rate_or_amount: number
          state: string
          updated_at: string
        }
        Insert: {
          basis: string
          computed_amount?: number | null
          created_at?: string
          created_by?: string | null
          deal_id: string
          funded_at?: string | null
          id?: string
          note?: string | null
          paid_at?: string | null
          party_id: string
          party_kind: string
          rate_or_amount: number
          state?: string
          updated_at?: string
        }
        Update: {
          basis?: string
          computed_amount?: number | null
          created_at?: string
          created_by?: string | null
          deal_id?: string
          funded_at?: string | null
          id?: string
          note?: string | null
          paid_at?: string | null
          party_id?: string
          party_kind?: string
          rate_or_amount?: number
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
            foreignKeyName: "consumer_report_requests_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "report_item_changes"
            referencedColumns: ["report_id"]
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
      credit_reports: {
        Row: {
          bureaus: string[]
          consumer_user_id: string | null
          created_at: string
          file_id: string | null
          fulfillment_client_id: string | null
          id: string
          imported_by: string
          organization_id: string | null
          outsourcing_group_id: string | null
          parser_version: string
          pulled_at: string
          source: string
        }
        Insert: {
          bureaus: string[]
          consumer_user_id?: string | null
          created_at?: string
          file_id?: string | null
          fulfillment_client_id?: string | null
          id?: string
          imported_by: string
          organization_id?: string | null
          outsourcing_group_id?: string | null
          parser_version: string
          pulled_at: string
          source: string
        }
        Update: {
          bureaus?: string[]
          consumer_user_id?: string | null
          created_at?: string
          file_id?: string | null
          fulfillment_client_id?: string | null
          id?: string
          imported_by?: string
          organization_id?: string | null
          outsourcing_group_id?: string | null
          parser_version?: string
          pulled_at?: string
          source?: string
        }
        Relationships: [
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
      departments: {
        Row: {
          agency_id: string
          created_at: string
          division: Database["public"]["Enums"]["fulfillment_service"]
          id: string
          key: string
          name: string
        }
        Insert: {
          agency_id: string
          created_at?: string
          division: Database["public"]["Enums"]["fulfillment_service"]
          id?: string
          key: string
          name: string
        }
        Update: {
          agency_id?: string
          created_at?: string
          division?: Database["public"]["Enums"]["fulfillment_service"]
          id?: string
          key?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
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
          created_at: string
          created_by: string | null
          document_type: string
          file_id: string
          id: string
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
          created_at?: string
          created_by?: string | null
          document_type: string
          file_id: string
          id?: string
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
          created_at?: string
          created_by?: string | null
          document_type?: string
          file_id?: string
          id?: string
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
            foreignKeyName: "document_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      eod_submissions: {
        Row: {
          additional_notes: string | null
          agency_id: string
          blockers: string | null
          created_at: string
          employee_id: string
          escalations: string | null
          id: string
          next_workday_priority: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          state: Database["public"]["Enums"]["eod_state"]
          submitted_at: string | null
          unfinished_work: string | null
          updated_at: string
          work_date: string
        }
        Insert: {
          additional_notes?: string | null
          agency_id: string
          blockers?: string | null
          created_at?: string
          employee_id: string
          escalations?: string | null
          id?: string
          next_workday_priority?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          state?: Database["public"]["Enums"]["eod_state"]
          submitted_at?: string | null
          unfinished_work?: string | null
          updated_at?: string
          work_date: string
        }
        Update: {
          additional_notes?: string | null
          agency_id?: string
          blockers?: string | null
          created_at?: string
          employee_id?: string
          escalations?: string | null
          id?: string
          next_workday_priority?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          state?: Database["public"]["Enums"]["eod_state"]
          submitted_at?: string | null
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
          size_bytes: number | null
          uploaded_by: string | null
        }
        Insert: {
          agency_id: string
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
          created_at: string
          created_by: string | null
          date_of_birth: string | null
          due_at: string | null
          email: string
          id: string
          last_activity_at: string
          lifecycle: Database["public"]["Enums"]["client_lifecycle"]
          mode: Database["public"]["Enums"]["fulfillment_mode"]
          name: string
          open_items: number
          organization_id: string | null
          outsourcing_group_id: string | null
          partner_scope_id: string | null
          phone: string | null
          preferred_name: string | null
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
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          due_at?: string | null
          email: string
          id?: string
          last_activity_at?: string
          lifecycle?: Database["public"]["Enums"]["client_lifecycle"]
          mode: Database["public"]["Enums"]["fulfillment_mode"]
          name: string
          open_items?: number
          organization_id?: string | null
          outsourcing_group_id?: string | null
          partner_scope_id?: string | null
          phone?: string | null
          preferred_name?: string | null
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
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          due_at?: string | null
          email?: string
          id?: string
          last_activity_at?: string
          lifecycle?: Database["public"]["Enums"]["client_lifecycle"]
          mode?: Database["public"]["Enums"]["fulfillment_mode"]
          name?: string
          open_items?: number
          organization_id?: string | null
          outsourcing_group_id?: string | null
          partner_scope_id?: string | null
          phone?: string | null
          preferred_name?: string | null
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
          created_at: string
          created_by: string | null
          due_at: string | null
          email: string
          fulfillment_client_id: string | null
          id: string
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
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          email: string
          fulfillment_client_id?: string | null
          id?: string
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
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          email?: string
          fulfillment_client_id?: string | null
          id?: string
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
          assigned_only: boolean
          created_at: string
          id: string
          organization_id: string
          product: Database["public"]["Enums"]["product_key"] | null
          role: Database["public"]["Enums"]["org_role"]
          team_scope: string | null
          user_id: string
        }
        Insert: {
          assigned_only?: boolean
          created_at?: string
          id?: string
          organization_id: string
          product?: Database["public"]["Enums"]["product_key"] | null
          role: Database["public"]["Enums"]["org_role"]
          team_scope?: string | null
          user_id: string
        }
        Update: {
          assigned_only?: boolean
          created_at?: string
          id?: string
          organization_id?: string
          product?: Database["public"]["Enums"]["product_key"] | null
          role?: Database["public"]["Enums"]["org_role"]
          team_scope?: string | null
          user_id?: string
        }
        Relationships: [
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
          is_fulfillment_subscriber: boolean
          joined_at: string
          name: string
          owner_user_id: string | null
          principal_email: string
          principal_name: string
          public_id: string
          status: Database["public"]["Enums"]["org_status"]
          updated_at: string
          workspace_views: Json
        }
        Insert: {
          address?: string | null
          agency_id: string
          branding?: Json
          code: string
          created_at?: string
          id?: string
          is_fulfillment_subscriber?: boolean
          joined_at?: string
          name: string
          owner_user_id?: string | null
          principal_email: string
          principal_name: string
          public_id?: string
          status?: Database["public"]["Enums"]["org_status"]
          updated_at?: string
          workspace_views?: Json
        }
        Update: {
          address?: string | null
          agency_id?: string
          branding?: Json
          code?: string
          created_at?: string
          id?: string
          is_fulfillment_subscriber?: boolean
          joined_at?: string
          name?: string
          owner_user_id?: string | null
          principal_email?: string
          principal_name?: string
          public_id?: string
          status?: Database["public"]["Enums"]["org_status"]
          updated_at?: string
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
          agency_id: string
          contact_email: string
          contract_ref: string | null
          created_at: string
          id: string
          name: string
          partner_name: string
          status: Database["public"]["Enums"]["outsourcing_group_status"]
          updated_at: string
        }
        Insert: {
          agency_id: string
          contact_email: string
          contract_ref?: string | null
          created_at?: string
          id?: string
          name: string
          partner_name: string
          status?: Database["public"]["Enums"]["outsourcing_group_status"]
          updated_at?: string
        }
        Update: {
          agency_id?: string
          contact_email?: string
          contract_ref?: string | null
          created_at?: string
          id?: string
          name?: string
          partner_name?: string
          status?: Database["public"]["Enums"]["outsourcing_group_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outsourcing_groups_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
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
            foreignKeyName: "report_findings_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "report_item_changes"
            referencedColumns: ["report_id"]
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
      report_items: {
        Row: {
          account_ref: string
          balance_cents: number | null
          balance_text: string | null
          bureaus: string[]
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
          status: string
          subtype: string | null
        }
        Insert: {
          account_ref: string
          balance_cents?: number | null
          balance_text?: string | null
          bureaus: string[]
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
          status: string
          subtype?: string | null
        }
        Update: {
          account_ref?: string
          balance_cents?: number | null
          balance_text?: string | null
          bureaus?: string[]
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
          {
            foreignKeyName: "report_items_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "report_item_changes"
            referencedColumns: ["report_id"]
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
          {
            foreignKeyName: "report_scores_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "report_item_changes"
            referencedColumns: ["report_id"]
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
          id: string
          name: string
          organization_id: string | null
        }
        Insert: {
          agency_id?: string | null
          archived_at?: string | null
          created_at?: string
          department_id?: string | null
          id?: string
          name: string
          organization_id?: string | null
        }
        Update: {
          agency_id?: string | null
          archived_at?: string | null
          created_at?: string
          department_id?: string | null
          id?: string
          name?: string
          organization_id?: string | null
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
          assigned_to: string | null
          board_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          division: Database["public"]["Enums"]["fulfillment_service"] | null
          due_at: string | null
          id: string
          item_type_id: string | null
          organization_id: string | null
          priority: Database["public"]["Enums"]["work_priority"]
          related_ref: string | null
          related_type: Database["public"]["Enums"]["work_related_type"]
          scope: Database["public"]["Enums"]["work_scope"]
          stage: Database["public"]["Enums"]["work_stage"]
          status_id: string | null
          subject_organization_id: string | null
          team_id: string | null
          title: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          agency_id: string
          assigned_to?: string | null
          board_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          division?: Database["public"]["Enums"]["fulfillment_service"] | null
          due_at?: string | null
          id?: string
          item_type_id?: string | null
          organization_id?: string | null
          priority?: Database["public"]["Enums"]["work_priority"]
          related_ref?: string | null
          related_type: Database["public"]["Enums"]["work_related_type"]
          scope: Database["public"]["Enums"]["work_scope"]
          stage?: Database["public"]["Enums"]["work_stage"]
          status_id?: string | null
          subject_organization_id?: string | null
          team_id?: string | null
          title: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          agency_id?: string
          assigned_to?: string | null
          board_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          division?: Database["public"]["Enums"]["fulfillment_service"] | null
          due_at?: string | null
          id?: string
          item_type_id?: string | null
          organization_id?: string | null
          priority?: Database["public"]["Enums"]["work_priority"]
          related_ref?: string | null
          related_type?: Database["public"]["Enums"]["work_related_type"]
          scope?: Database["public"]["Enums"]["work_scope"]
          stage?: Database["public"]["Enums"]["work_stage"]
          status_id?: string | null
          subject_organization_id?: string | null
          team_id?: string | null
          title?: string
          updated_at?: string
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
          archived_at: string | null
          colour: string | null
          created_at: string
          created_by: string | null
          description: string | null
          icon: string | null
          id: string
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          colour?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          colour?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
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
        Relationships: [
          {
            foreignKeyName: "credit_reports_fulfillment_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "fulfillment_clients"
            referencedColumns: ["id"]
          },
        ]
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
      accept_invitation: { Args: { p_token: string }; Returns: string }
      acknowledge_policy_update: {
        Args: { p_update: string }
        Returns: undefined
      }
      activity_service: {
        Args: { p_entity_type: string }
        Returns: Database["public"]["Enums"]["fulfillment_service"]
      }
      advance_closing: {
        Args: {
          p_closing: string
          p_note?: string
          p_status: Database["public"]["Enums"]["closing_status"]
        }
        Returns: undefined
      }
      agency_of_org: { Args: { p_org: string }; Returns: string }
      ai_can_use: {
        Args: { p_feature: string; p_org: string }
        Returns: boolean
      }
      ai_credit_balance: { Args: { p_org: string }; Returns: number }
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
      approve_dispute_letter: { Args: { p_letter: string }; Returns: undefined }
      archive_announcement: { Args: { p_id: string }; Returns: undefined }
      archive_knowledge_article: { Args: { p_id: string }; Returns: undefined }
      as_uuid: { Args: { p: string }; Returns: string }
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
      bes_engaged_with: { Args: { p_org: string }; Returns: boolean }
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
      copy_member_permissions: {
        Args: { p_copy_scope?: boolean; p_from: string; p_to: string }
        Returns: undefined
      }
      create_credit_report: {
        Args: {
          p_bureaus: string[]
          p_client: string
          p_consumer: string
          p_file: string
          p_group: string
          p_items: Json
          p_org: string
          p_parser_version: string
          p_pulled_at: string
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
      dev_seed_user: {
        Args: { p_email: string; p_full_name: string; p_password: string }
        Returns: string
      }
      dev_uuid: { Args: { p_key: string }; Returns: string }
      engagement_is_live: {
        Args: {
          p_from: string
          p_status: Database["public"]["Enums"]["engagement_status"]
          p_to: string
        }
        Returns: boolean
      }
      entity_visible: {
        Args: { p_entity_id: string; p_entity_type: string }
        Returns: boolean
      }
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
      grant_ai_credits: {
        Args: {
          p_credits: number
          p_kind: string
          p_org: string
          p_reference?: string
        }
        Returns: string
      }
      handoff_to_creditops: {
        Args: { p_existing_client?: string; p_funding_client: string }
        Returns: string
      }
      handoff_to_fundingops: {
        Args: { p_fulfillment_client: string }
        Returns: string
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
      is_external_member: { Args: { p_org: string }; Returns: boolean }
      is_lender_for_file: { Args: { p_file: string }; Returns: boolean }
      is_manager_of: { Args: { p_agency: string }; Returns: boolean }
      is_member_of_team: { Args: { p_team: string }; Returns: boolean }
      is_org_admin: { Args: { p_org: string }; Returns: boolean }
      is_org_member: { Args: { p_org: string }; Returns: boolean }
      is_org_owner_admin: { Args: { p_org: string }; Returns: boolean }
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
      mark_letter_mailed: {
        Args: { p_letter: string; p_mailed_at?: string }
        Returns: undefined
      }
      member_can: { Args: { p_key: string; p_org: string }; Returns: boolean }
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
      my_org_ids: { Args: never; Returns: string[] }
      my_permissions: {
        Args: { p_org: string }
        Returns: {
          allowed: boolean
          key: string
        }[]
      }
      normalize_business_name: { Args: { p: string }; Returns: string }
      normalize_phone: { Args: { p: string }; Returns: string }
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
      organization_seat_usage: { Args: { p_org: string }; Returns: number }
      record_document_disposition: {
        Args: {
          p_disposition: Database["public"]["Enums"]["document_disposition"]
          p_instance: string
          p_reason?: string
        }
        Returns: undefined
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
      record_owner: {
        Args: { p_entity_id: string; p_entity_type: string }
        Returns: Record<string, unknown>
      }
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
      shares_scope_with: { Args: { p_user: string }; Returns: boolean }
      start_closing: {
        Args: { p_note?: string; p_offer: string }
        Returns: string
      }
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
      to_service: {
        Args: { p: string }
        Returns: Database["public"]["Enums"]["fulfillment_service"]
      }
      try_bigint: { Args: { t: string }; Returns: number }
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
      agency_role:
        | "agency_owner"
        | "agency_admin"
        | "agency_manager"
        | "agency_team_lead"
        | "agency_agent"
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
      client_lifecycle:
        | "active"
        | "program_completed"
        | "graduated"
        | "archived"
      closing_status:
        | "started"
        | "requirements_outstanding"
        | "awaiting_signatures"
        | "signed"
        | "funding_pending"
        | "funded"
        | "cancelled"
      consumer_report_authorization: "authorized" | "pending" | "refused"
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
      document_request_status: "open" | "satisfied" | "waived"
      document_requirement: "required" | "conditional"
      engagement_status: "pending" | "active" | "paused" | "ended"
      eod_state:
        | "draft"
        | "submitted"
        | "needs_clarification"
        | "reviewed"
        | "approved"
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
      fulfillment_service: "creditops" | "fundingops" | "bes_crm" | "talentops"
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
      identity_kind:
        | "email"
        | "email_domain"
        | "phone"
        | "business_name"
        | "ein"
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
      outsourcing_group_status: "Active" | "Paused" | "Onboarding"
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
      renewal_status:
        | "monitoring"
        | "review_due"
        | "outreach"
        | "client_interested"
        | "new_file_created"
        | "not_pursued"
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
      agency_role: [
        "agency_owner",
        "agency_admin",
        "agency_manager",
        "agency_team_lead",
        "agency_agent",
      ],
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
      client_lifecycle: [
        "active",
        "program_completed",
        "graduated",
        "archived",
      ],
      closing_status: [
        "started",
        "requirements_outstanding",
        "awaiting_signatures",
        "signed",
        "funding_pending",
        "funded",
        "cancelled",
      ],
      consumer_report_authorization: ["authorized", "pending", "refused"],
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
      document_request_status: ["open", "satisfied", "waived"],
      document_requirement: ["required", "conditional"],
      engagement_status: ["pending", "active", "paused", "ended"],
      eod_state: [
        "draft",
        "submitted",
        "needs_clarification",
        "reviewed",
        "approved",
      ],
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
      ],
      fulfillment_service: ["creditops", "fundingops", "bes_crm", "talentops"],
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
      identity_kind: ["email", "email_domain", "phone", "business_name", "ein"],
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
      outsourcing_group_status: ["Active", "Paused", "Onboarding"],
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
      ],
      renewal_status: [
        "monitoring",
        "review_due",
        "outreach",
        "client_interested",
        "new_file_created",
        "not_pursued",
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
    },
  },
} as const
