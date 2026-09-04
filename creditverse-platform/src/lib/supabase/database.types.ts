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
          assigned_agent_id: string | null
          auto_sync: boolean
          created_at: string
          created_by: string | null
          due_at: string | null
          email: string
          id: string
          last_activity_at: string
          mode: Database["public"]["Enums"]["fulfillment_mode"]
          name: string
          open_items: number
          organization_id: string | null
          outsourcing_group_id: string | null
          partner_scope_id: string | null
          phone: string | null
          round: Database["public"]["Enums"]["fulfillment_round"]
          status: Database["public"]["Enums"]["fulfillment_client_status"]
          team_id: string | null
          updated_at: string
        }
        Insert: {
          agency_id: string
          assigned_agent_id?: string | null
          auto_sync?: boolean
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          email: string
          id?: string
          last_activity_at?: string
          mode: Database["public"]["Enums"]["fulfillment_mode"]
          name: string
          open_items?: number
          organization_id?: string | null
          outsourcing_group_id?: string | null
          partner_scope_id?: string | null
          phone?: string | null
          round?: Database["public"]["Enums"]["fulfillment_round"]
          status?: Database["public"]["Enums"]["fulfillment_client_status"]
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          agency_id?: string
          assigned_agent_id?: string | null
          auto_sync?: boolean
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          email?: string
          id?: string
          last_activity_at?: string
          mode?: Database["public"]["Enums"]["fulfillment_mode"]
          name?: string
          open_items?: number
          organization_id?: string | null
          outsourcing_group_id?: string | null
          partner_scope_id?: string | null
          phone?: string | null
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
          assigned_agent_id: string | null
          auto_sync: boolean
          created_at: string
          created_by: string | null
          due_at: string | null
          email: string
          fulfillment_client_id: string | null
          id: string
          last_activity_at: string
          mode: Database["public"]["Enums"]["fulfillment_mode"]
          name: string
          organization_id: string | null
          outsourcing_group_id: string | null
          partner_scope_id: string | null
          phone: string | null
          provenance: Database["public"]["Enums"]["funding_provenance"]
          status: Database["public"]["Enums"]["funding_client_status"]
          team_id: string | null
          updated_at: string
        }
        Insert: {
          agency_id: string
          assigned_agent_id?: string | null
          auto_sync?: boolean
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          email: string
          fulfillment_client_id?: string | null
          id?: string
          last_activity_at?: string
          mode: Database["public"]["Enums"]["fulfillment_mode"]
          name: string
          organization_id?: string | null
          outsourcing_group_id?: string | null
          partner_scope_id?: string | null
          phone?: string | null
          provenance?: Database["public"]["Enums"]["funding_provenance"]
          status?: Database["public"]["Enums"]["funding_client_status"]
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          agency_id?: string
          assigned_agent_id?: string | null
          auto_sync?: boolean
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          email?: string
          fulfillment_client_id?: string | null
          id?: string
          last_activity_at?: string
          mode?: Database["public"]["Enums"]["fulfillment_mode"]
          name?: string
          organization_id?: string | null
          outsourcing_group_id?: string | null
          partner_scope_id?: string | null
          phone?: string | null
          provenance?: Database["public"]["Enums"]["funding_provenance"]
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
          funded_at: string | null
          id: string
          lender: string
          program: string | null
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
          funded_at?: string | null
          id?: string
          lender: string
          program?: string | null
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
          funded_at?: string | null
          id?: string
          lender?: string
          program?: string | null
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
            referencedRelation: "funding_files"
            referencedColumns: ["id"]
          },
        ]
      }
      funding_department_statuses: {
        Row: {
          assignee_id: string | null
          client_id: string
          department: Database["public"]["Enums"]["funding_department"]
          status: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          client_id: string
          department: Database["public"]["Enums"]["funding_department"]
          status: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          client_id?: string
          department?: Database["public"]["Enums"]["funding_department"]
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
          purpose: string
          requested_amount: number
          stage: Database["public"]["Enums"]["funding_file_stage"]
          updated_at: string
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
          purpose: string
          requested_amount: number
          stage?: Database["public"]["Enums"]["funding_file_stage"]
          updated_at?: string
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
          purpose?: string
          requested_amount?: number
          stage?: Database["public"]["Enums"]["funding_file_stage"]
          updated_at?: string
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
          principal_email: string
          principal_name: string
          public_id: string
          status: Database["public"]["Enums"]["org_status"]
          updated_at: string
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
          principal_email: string
          principal_name: string
          public_id?: string
          status?: Database["public"]["Enums"]["org_status"]
          updated_at?: string
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
          principal_email?: string
          principal_name?: string
          public_id?: string
          status?: Database["public"]["Enums"]["org_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
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
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          updated_at?: string
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
          pinned_org_ids: string[]
          recent_org_ids: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          pinned_org_ids?: string[]
          recent_org_ids?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
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
      activity_service: {
        Args: { p_entity_type: string }
        Returns: Database["public"]["Enums"]["fulfillment_service"]
      }
      agency_of_org: { Args: { p_org: string }; Returns: string }
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
      current_agency_role: {
        Args: never
        Returns: Database["public"]["Enums"]["agency_role"]
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
      find_client_across_divisions: {
        Args: { p_email: string; p_scope: string }
        Returns: {
          client_id: string
          client_name: string
          division: string
          status: string
        }[]
      }
      gen_org_public_id: { Args: never; Returns: string }
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
      is_admin_of: { Args: { p_agency: string }; Returns: boolean }
      is_agency_admin: { Args: never; Returns: boolean }
      is_agency_manager_or_above: { Args: never; Returns: boolean }
      is_agency_staff: { Args: never; Returns: boolean }
      is_external_member: { Args: { p_org: string }; Returns: boolean }
      is_manager_of: { Args: { p_agency: string }; Returns: boolean }
      is_org_admin: { Args: { p_org: string }; Returns: boolean }
      is_org_member: { Args: { p_org: string }; Returns: boolean }
      is_org_owner_admin: { Args: { p_org: string }; Returns: boolean }
      is_staff_of: { Args: { p_agency: string }; Returns: boolean }
      is_team_lead_of: { Args: { p_team: string }; Returns: boolean }
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
      merge_agency_branding: {
        Args: { p_agency: string; p_patch: Json }
        Returns: Json
      }
      merge_organization_branding: {
        Args: { p_org: string; p_patch: Json }
        Returns: Json
      }
      my_org_ids: { Args: never; Returns: string[] }
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
      record_owner: {
        Args: { p_entity_id: string; p_entity_type: string }
        Returns: Record<string, unknown>
      }
      shares_scope_with: { Args: { p_user: string }; Returns: boolean }
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
      funding_file_stage:
        | "Readiness Review"
        | "Document Review"
        | "Lender Matching"
        | "Submitted"
        | "Stipulations"
        | "Offer Received"
        | "Funded"
        | "Declined"
        | "Withdrawn"
      funding_provenance: "bes_saas_synced" | "agency_manual"
      membership_kind: "agency" | "organization" | "external"
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
      product_key:
        | "creditOps"
        | "fundingOps"
        | "diyCredit"
        | "oi"
        | "crm"
        | "workspaces"
        | "talentOps"
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
      agency_role: [
        "agency_owner",
        "agency_admin",
        "agency_manager",
        "agency_team_lead",
        "agency_agent",
      ],
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
      funding_file_stage: [
        "Readiness Review",
        "Document Review",
        "Lender Matching",
        "Submitted",
        "Stipulations",
        "Offer Received",
        "Funded",
        "Declined",
        "Withdrawn",
      ],
      funding_provenance: ["bes_saas_synced", "agency_manual"],
      membership_kind: ["agency", "organization", "external"],
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
      product_key: [
        "creditOps",
        "fundingOps",
        "diyCredit",
        "oi",
        "crm",
        "workspaces",
        "talentOps",
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
