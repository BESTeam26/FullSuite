export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      activity_events: {
        Row: {
          action: string;
          actor_id: string | null;
          actor_name: string | null;
          created_at: string;
          detail: string | null;
          entity_id: string;
          entity_type: string;
          field: string | null;
          id: number;
          mark: string | null;
          new_value: string | null;
          organization_id: string | null;
          pinned: boolean;
          previous_value: string | null;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          actor_name?: string | null;
          created_at?: string;
          detail?: string | null;
          entity_id: string;
          entity_type: string;
          field?: string | null;
          id?: never;
          mark?: string | null;
          new_value?: string | null;
          organization_id?: string | null;
          pinned?: boolean;
          previous_value?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          actor_name?: string | null;
          created_at?: string;
          detail?: string | null;
          entity_id?: string;
          entity_type?: string;
          field?: string | null;
          id?: never;
          mark?: string | null;
          new_value?: string | null;
          organization_id?: string | null;
          pinned?: boolean;
          previous_value?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "activity_events_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "activity_events_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      agencies: {
        Row: {
          branding: Json;
          created_at: string;
          id: string;
          name: string;
          slug: string;
          updated_at: string;
        };
        Insert: {
          branding?: Json;
          created_at?: string;
          id?: string;
          name: string;
          slug: string;
          updated_at?: string;
        };
        Update: {
          branding?: Json;
          created_at?: string;
          id?: string;
          name?: string;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      agency_memberships: {
        Row: {
          agency_id: string;
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["agency_role"];
          user_id: string;
        };
        Insert: {
          agency_id: string;
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["agency_role"];
          user_id: string;
        };
        Update: {
          agency_id?: string;
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["agency_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agency_memberships_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agency_memberships_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          after: Json | null;
          agency_id: string | null;
          before: Json | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          id: number;
          organization_id: string | null;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          after?: Json | null;
          agency_id?: string | null;
          before?: Json | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          id?: never;
          organization_id?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          after?: Json | null;
          agency_id?: string | null;
          before?: Json | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          id?: never;
          organization_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_log_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_log_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      businesses: {
        Row: {
          created_at: string;
          ein_last4: string | null;
          id: string;
          industry: string | null;
          legal_name: string | null;
          monthly_revenue: number | null;
          name: string;
          organization_id: string;
          time_in_business_months: number | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          ein_last4?: string | null;
          id?: string;
          industry?: string | null;
          legal_name?: string | null;
          monthly_revenue?: number | null;
          name: string;
          organization_id: string;
          time_in_business_months?: number | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          ein_last4?: string | null;
          id?: string;
          industry?: string | null;
          legal_name?: string | null;
          monthly_revenue?: number | null;
          name?: string;
          organization_id?: string;
          time_in_business_months?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "businesses_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      client_department_statuses: {
        Row: {
          assignee_id: string | null;
          client_id: string;
          department: Database["public"]["Enums"]["fulfillment_department"];
          status: string;
          updated_at: string;
        };
        Insert: {
          assignee_id?: string | null;
          client_id: string;
          department: Database["public"]["Enums"]["fulfillment_department"];
          status: string;
          updated_at?: string;
        };
        Update: {
          assignee_id?: string | null;
          client_id?: string;
          department?: Database["public"]["Enums"]["fulfillment_department"];
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "client_department_statuses_assignee_id_fkey";
            columns: ["assignee_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "client_department_statuses_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "fulfillment_clients";
            referencedColumns: ["id"];
          },
        ];
      };
      eod_submissions: {
        Row: {
          additional_notes: string | null;
          agency_id: string;
          blockers: string | null;
          created_at: string;
          employee_id: string;
          escalations: string | null;
          id: string;
          next_workday_priority: string | null;
          review_note: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          state: Database["public"]["Enums"]["eod_state"];
          submitted_at: string | null;
          unfinished_work: string | null;
          updated_at: string;
          work_date: string;
        };
        Insert: {
          additional_notes?: string | null;
          agency_id: string;
          blockers?: string | null;
          created_at?: string;
          employee_id: string;
          escalations?: string | null;
          id?: string;
          next_workday_priority?: string | null;
          review_note?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          state?: Database["public"]["Enums"]["eod_state"];
          submitted_at?: string | null;
          unfinished_work?: string | null;
          updated_at?: string;
          work_date: string;
        };
        Update: {
          additional_notes?: string | null;
          agency_id?: string;
          blockers?: string | null;
          created_at?: string;
          employee_id?: string;
          escalations?: string | null;
          id?: string;
          next_workday_priority?: string | null;
          review_note?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          state?: Database["public"]["Enums"]["eod_state"];
          submitted_at?: string | null;
          unfinished_work?: string | null;
          updated_at?: string;
          work_date?: string;
        };
        Relationships: [
          {
            foreignKeyName: "eod_submissions_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "eod_submissions_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "eod_submissions_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      external_memberships: {
        Row: {
          created_at: string;
          id: string;
          organization_id: string;
          role: Database["public"]["Enums"]["external_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          organization_id: string;
          role: Database["public"]["Enums"]["external_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          organization_id?: string;
          role?: Database["public"]["Enums"]["external_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "external_memberships_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "external_memberships_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      files: {
        Row: {
          bucket: string;
          created_at: string;
          entity_id: string | null;
          entity_type: string | null;
          id: string;
          mime_type: string | null;
          name: string;
          organization_id: string | null;
          path: string;
          sha256: string | null;
          size_bytes: number | null;
          uploaded_by: string | null;
        };
        Insert: {
          bucket?: string;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          mime_type?: string | null;
          name: string;
          organization_id?: string | null;
          path: string;
          sha256?: string | null;
          size_bytes?: number | null;
          uploaded_by?: string | null;
        };
        Update: {
          bucket?: string;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          mime_type?: string | null;
          name?: string;
          organization_id?: string | null;
          path?: string;
          sha256?: string | null;
          size_bytes?: number | null;
          uploaded_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "files_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "files_uploaded_by_fkey";
            columns: ["uploaded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      fulfillment_clients: {
        Row: {
          agency_id: string;
          assigned_agent_id: string | null;
          auto_sync: boolean;
          created_at: string;
          created_by: string | null;
          due_at: string | null;
          email: string;
          id: string;
          last_activity_at: string;
          mode: Database["public"]["Enums"]["fulfillment_mode"];
          name: string;
          open_items: number;
          organization_id: string | null;
          outsourcing_group_id: string | null;
          partner_scope_id: string | null;
          phone: string | null;
          round: Database["public"]["Enums"]["fulfillment_round"];
          status: Database["public"]["Enums"]["fulfillment_client_status"];
          updated_at: string;
        };
        Insert: {
          agency_id: string;
          assigned_agent_id?: string | null;
          auto_sync?: boolean;
          created_at?: string;
          created_by?: string | null;
          due_at?: string | null;
          email: string;
          id?: string;
          last_activity_at?: string;
          mode: Database["public"]["Enums"]["fulfillment_mode"];
          name: string;
          open_items?: number;
          organization_id?: string | null;
          outsourcing_group_id?: string | null;
          partner_scope_id?: string | null;
          phone?: string | null;
          round?: Database["public"]["Enums"]["fulfillment_round"];
          status?: Database["public"]["Enums"]["fulfillment_client_status"];
          updated_at?: string;
        };
        Update: {
          agency_id?: string;
          assigned_agent_id?: string | null;
          auto_sync?: boolean;
          created_at?: string;
          created_by?: string | null;
          due_at?: string | null;
          email?: string;
          id?: string;
          last_activity_at?: string;
          mode?: Database["public"]["Enums"]["fulfillment_mode"];
          name?: string;
          open_items?: number;
          organization_id?: string | null;
          outsourcing_group_id?: string | null;
          partner_scope_id?: string | null;
          phone?: string | null;
          round?: Database["public"]["Enums"]["fulfillment_round"];
          status?: Database["public"]["Enums"]["fulfillment_client_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fulfillment_clients_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fulfillment_clients_assigned_agent_id_fkey";
            columns: ["assigned_agent_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fulfillment_clients_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fulfillment_clients_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fulfillment_clients_outsourcing_group_id_fkey";
            columns: ["outsourcing_group_id"];
            isOneToOne: false;
            referencedRelation: "outsourcing_groups";
            referencedColumns: ["id"];
          },
        ];
      };
      invitations: {
        Row: {
          accepted_at: string | null;
          agency_id: string | null;
          agency_role: Database["public"]["Enums"]["agency_role"] | null;
          created_at: string;
          email: string;
          expires_at: string;
          external_role: Database["public"]["Enums"]["external_role"] | null;
          id: string;
          invited_by: string | null;
          kind: Database["public"]["Enums"]["membership_kind"];
          org_role: Database["public"]["Enums"]["org_role"] | null;
          organization_id: string | null;
          token: string;
        };
        Insert: {
          accepted_at?: string | null;
          agency_id?: string | null;
          agency_role?: Database["public"]["Enums"]["agency_role"] | null;
          created_at?: string;
          email: string;
          expires_at?: string;
          external_role?: Database["public"]["Enums"]["external_role"] | null;
          id?: string;
          invited_by?: string | null;
          kind: Database["public"]["Enums"]["membership_kind"];
          org_role?: Database["public"]["Enums"]["org_role"] | null;
          organization_id?: string | null;
          token?: string;
        };
        Update: {
          accepted_at?: string | null;
          agency_id?: string | null;
          agency_role?: Database["public"]["Enums"]["agency_role"] | null;
          created_at?: string;
          email?: string;
          expires_at?: string;
          external_role?: Database["public"]["Enums"]["external_role"] | null;
          id?: string;
          invited_by?: string | null;
          kind?: Database["public"]["Enums"]["membership_kind"];
          org_role?: Database["public"]["Enums"]["org_role"] | null;
          organization_id?: string | null;
          token?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invitations_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invitations_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invitations_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      org_memberships: {
        Row: {
          assigned_only: boolean;
          created_at: string;
          id: string;
          organization_id: string;
          product: Database["public"]["Enums"]["product_key"] | null;
          role: Database["public"]["Enums"]["org_role"];
          team_scope: string | null;
          user_id: string;
        };
        Insert: {
          assigned_only?: boolean;
          created_at?: string;
          id?: string;
          organization_id: string;
          product?: Database["public"]["Enums"]["product_key"] | null;
          role: Database["public"]["Enums"]["org_role"];
          team_scope?: string | null;
          user_id: string;
        };
        Update: {
          assigned_only?: boolean;
          created_at?: string;
          id?: string;
          organization_id?: string;
          product?: Database["public"]["Enums"]["product_key"] | null;
          role?: Database["public"]["Enums"]["org_role"];
          team_scope?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "org_memberships_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "org_memberships_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          address: string | null;
          agency_id: string;
          branding: Json;
          code: string;
          created_at: string;
          id: string;
          is_fulfillment_subscriber: boolean;
          joined_at: string;
          name: string;
          principal_email: string;
          principal_name: string;
          status: Database["public"]["Enums"]["org_status"];
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          agency_id: string;
          branding?: Json;
          code: string;
          created_at?: string;
          id?: string;
          is_fulfillment_subscriber?: boolean;
          joined_at?: string;
          name: string;
          principal_email: string;
          principal_name: string;
          status?: Database["public"]["Enums"]["org_status"];
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          agency_id?: string;
          branding?: Json;
          code?: string;
          created_at?: string;
          id?: string;
          is_fulfillment_subscriber?: boolean;
          joined_at?: string;
          name?: string;
          principal_email?: string;
          principal_name?: string;
          status?: Database["public"]["Enums"]["org_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organizations_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
        ];
      };
      outsourcing_groups: {
        Row: {
          agency_id: string;
          contact_email: string;
          contract_ref: string | null;
          created_at: string;
          id: string;
          name: string;
          partner_name: string;
          status: Database["public"]["Enums"]["outsourcing_group_status"];
          updated_at: string;
        };
        Insert: {
          agency_id: string;
          contact_email: string;
          contract_ref?: string | null;
          created_at?: string;
          id?: string;
          name: string;
          partner_name: string;
          status?: Database["public"]["Enums"]["outsourcing_group_status"];
          updated_at?: string;
        };
        Update: {
          agency_id?: string;
          contact_email?: string;
          contract_ref?: string | null;
          created_at?: string;
          id?: string;
          name?: string;
          partner_name?: string;
          status?: Database["public"]["Enums"]["outsourcing_group_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "outsourcing_groups_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
        ];
      };
      product_entitlements: {
        Row: {
          enabled: boolean;
          organization_id: string;
          product: Database["public"]["Enums"]["product_key"];
          updated_at: string;
        };
        Insert: {
          enabled?: boolean;
          organization_id: string;
          product: Database["public"]["Enums"]["product_key"];
          updated_at?: string;
        };
        Update: {
          enabled?: boolean;
          organization_id?: string;
          product?: Database["public"]["Enums"]["product_key"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_entitlements_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      production_logs: {
        Row: {
          actions: string[];
          agency_id: string;
          client_id: string | null;
          completed_at: string;
          created_at: string;
          department:
            Database["public"]["Enums"]["fulfillment_department"] | null;
          division_id: string;
          employee_id: string;
          id: string;
          is_voided: boolean;
          organization_id: string | null;
          outsourcing_group_id: string | null;
          production_unit_quantity: number;
          production_unit_type: string;
          void_reason: string | null;
          voided_at: string | null;
          voided_by: string | null;
          work_date: string;
          work_notes: string | null;
        };
        Insert: {
          actions?: string[];
          agency_id: string;
          client_id?: string | null;
          completed_at?: string;
          created_at?: string;
          department?:
            Database["public"]["Enums"]["fulfillment_department"] | null;
          division_id?: string;
          employee_id: string;
          id?: string;
          is_voided?: boolean;
          organization_id?: string | null;
          outsourcing_group_id?: string | null;
          production_unit_quantity?: number;
          production_unit_type: string;
          void_reason?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
          work_date: string;
          work_notes?: string | null;
        };
        Update: {
          actions?: string[];
          agency_id?: string;
          client_id?: string | null;
          completed_at?: string;
          created_at?: string;
          department?:
            Database["public"]["Enums"]["fulfillment_department"] | null;
          division_id?: string;
          employee_id?: string;
          id?: string;
          is_voided?: boolean;
          organization_id?: string | null;
          outsourcing_group_id?: string | null;
          production_unit_quantity?: number;
          production_unit_type?: string;
          void_reason?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
          work_date?: string;
          work_notes?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "production_logs_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "production_logs_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "fulfillment_clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "production_logs_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "production_logs_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "production_logs_outsourcing_group_id_fkey";
            columns: ["outsourcing_group_id"];
            isOneToOne: false;
            referencedRelation: "outsourcing_groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "production_logs_voided_by_fkey";
            columns: ["voided_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          email: string;
          full_name: string | null;
          id: string;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          email: string;
          full_name?: string | null;
          id: string;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string;
          full_name?: string | null;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      record_grants: {
        Row: {
          created_at: string;
          external_membership_id: string;
          granted_by: string | null;
          id: string;
          record_id: string;
          record_type: string;
        };
        Insert: {
          created_at?: string;
          external_membership_id: string;
          granted_by?: string | null;
          id?: string;
          record_id: string;
          record_type: string;
        };
        Update: {
          created_at?: string;
          external_membership_id?: string;
          granted_by?: string | null;
          id?: string;
          record_id?: string;
          record_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "record_grants_external_membership_id_fkey";
            columns: ["external_membership_id"];
            isOneToOne: false;
            referencedRelation: "external_memberships";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "record_grants_granted_by_fkey";
            columns: ["granted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      time_entries: {
        Row: {
          agency_id: string;
          client_id: string | null;
          created_at: string;
          division_id: string;
          duration_minutes: number | null;
          employee_id: string;
          ended_at: string | null;
          id: string;
          organization_id: string | null;
          started_at: string;
          task_note: string | null;
          work_date: string;
          work_item_id: string | null;
        };
        Insert: {
          agency_id: string;
          client_id?: string | null;
          created_at?: string;
          division_id?: string;
          duration_minutes?: number | null;
          employee_id: string;
          ended_at?: string | null;
          id?: string;
          organization_id?: string | null;
          started_at?: string;
          task_note?: string | null;
          work_date?: string;
          work_item_id?: string | null;
        };
        Update: {
          agency_id?: string;
          client_id?: string | null;
          created_at?: string;
          division_id?: string;
          duration_minutes?: number | null;
          employee_id?: string;
          ended_at?: string | null;
          id?: string;
          organization_id?: string | null;
          started_at?: string;
          task_note?: string | null;
          work_date?: string;
          work_item_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "time_entries_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "time_entries_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "fulfillment_clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "time_entries_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "time_entries_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "time_entries_work_item_id_fkey";
            columns: ["work_item_id"];
            isOneToOne: false;
            referencedRelation: "work_attention";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "time_entries_work_item_id_fkey";
            columns: ["work_item_id"];
            isOneToOne: false;
            referencedRelation: "work_items";
            referencedColumns: ["id"];
          },
        ];
      };
      user_preferences: {
        Row: {
          pinned_org_ids: string[];
          recent_org_ids: string[];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          pinned_org_ids?: string[];
          recent_org_ids?: string[];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          pinned_org_ids?: string[];
          recent_org_ids?: string[];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_preferences_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      webhook_deliveries: {
        Row: {
          agency_id: string;
          client_id: string | null;
          client_name: string;
          created_at: string;
          endpoint_id: string | null;
          endpoint_name: string;
          id: number;
          message: string | null;
          new_status: string;
          partner_name: string;
          previous_status: string | null;
          status: Database["public"]["Enums"]["webhook_delivery_status"];
        };
        Insert: {
          agency_id: string;
          client_id?: string | null;
          client_name: string;
          created_at?: string;
          endpoint_id?: string | null;
          endpoint_name: string;
          id?: never;
          message?: string | null;
          new_status: string;
          partner_name: string;
          previous_status?: string | null;
          status: Database["public"]["Enums"]["webhook_delivery_status"];
        };
        Update: {
          agency_id?: string;
          client_id?: string | null;
          client_name?: string;
          created_at?: string;
          endpoint_id?: string | null;
          endpoint_name?: string;
          id?: never;
          message?: string | null;
          new_status?: string;
          partner_name?: string;
          previous_status?: string | null;
          status?: Database["public"]["Enums"]["webhook_delivery_status"];
        };
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "webhook_deliveries_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "fulfillment_clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "webhook_deliveries_endpoint_id_fkey";
            columns: ["endpoint_id"];
            isOneToOne: false;
            referencedRelation: "webhook_endpoints";
            referencedColumns: ["id"];
          },
        ];
      };
      webhook_endpoints: {
        Row: {
          agency_id: string;
          created_at: string;
          credential_hint: string | null;
          enabled: boolean;
          fires: number;
          id: string;
          last_fired_at: string | null;
          name: string;
          type: Database["public"]["Enums"]["webhook_endpoint_type"];
          updated_at: string;
          url: string | null;
        };
        Insert: {
          agency_id: string;
          created_at?: string;
          credential_hint?: string | null;
          enabled?: boolean;
          fires?: number;
          id?: string;
          last_fired_at?: string | null;
          name: string;
          type: Database["public"]["Enums"]["webhook_endpoint_type"];
          updated_at?: string;
          url?: string | null;
        };
        Update: {
          agency_id?: string;
          created_at?: string;
          credential_hint?: string | null;
          enabled?: boolean;
          fires?: number;
          id?: string;
          last_fired_at?: string | null;
          name?: string;
          type?: Database["public"]["Enums"]["webhook_endpoint_type"];
          updated_at?: string;
          url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "webhook_endpoints_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
        ];
      };
      work_items: {
        Row: {
          assigned_to: string | null;
          completed_at: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          due_at: string | null;
          id: string;
          organization_id: string | null;
          priority: Database["public"]["Enums"]["work_priority"];
          related_ref: string | null;
          related_type: Database["public"]["Enums"]["work_related_type"];
          scope: Database["public"]["Enums"]["work_scope"];
          stage: Database["public"]["Enums"]["work_stage"];
          subject_organization_id: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          assigned_to?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          due_at?: string | null;
          id?: string;
          organization_id?: string | null;
          priority?: Database["public"]["Enums"]["work_priority"];
          related_ref?: string | null;
          related_type: Database["public"]["Enums"]["work_related_type"];
          scope: Database["public"]["Enums"]["work_scope"];
          stage?: Database["public"]["Enums"]["work_stage"];
          subject_organization_id?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          assigned_to?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          due_at?: string | null;
          id?: string;
          organization_id?: string | null;
          priority?: Database["public"]["Enums"]["work_priority"];
          related_ref?: string | null;
          related_type?: Database["public"]["Enums"]["work_related_type"];
          scope?: Database["public"]["Enums"]["work_scope"];
          stage?: Database["public"]["Enums"]["work_stage"];
          subject_organization_id?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "work_items_assigned_to_fkey";
            columns: ["assigned_to"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "work_items_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "work_items_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "work_items_subject_organization_id_fkey";
            columns: ["subject_organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      work_attention: {
        Row: {
          assigned_to: string | null;
          attention_reason: string | null;
          completed_at: string | null;
          created_at: string | null;
          created_by: string | null;
          description: string | null;
          due_at: string | null;
          hours_remaining: number | null;
          id: string | null;
          organization_id: string | null;
          priority: Database["public"]["Enums"]["work_priority"] | null;
          related_ref: string | null;
          related_type: Database["public"]["Enums"]["work_related_type"] | null;
          scope: Database["public"]["Enums"]["work_scope"] | null;
          stage: Database["public"]["Enums"]["work_stage"] | null;
          subject_organization_id: string | null;
          title: string | null;
          updated_at: string | null;
        };
        Insert: {
          assigned_to?: string | null;
          attention_reason?: never;
          completed_at?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          description?: string | null;
          due_at?: string | null;
          hours_remaining?: never;
          id?: string | null;
          organization_id?: string | null;
          priority?: Database["public"]["Enums"]["work_priority"] | null;
          related_ref?: string | null;
          related_type?:
            Database["public"]["Enums"]["work_related_type"] | null;
          scope?: Database["public"]["Enums"]["work_scope"] | null;
          stage?: Database["public"]["Enums"]["work_stage"] | null;
          subject_organization_id?: string | null;
          title?: string | null;
          updated_at?: string | null;
        };
        Update: {
          assigned_to?: string | null;
          attention_reason?: never;
          completed_at?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          description?: string | null;
          due_at?: string | null;
          hours_remaining?: never;
          id?: string | null;
          organization_id?: string | null;
          priority?: Database["public"]["Enums"]["work_priority"] | null;
          related_ref?: string | null;
          related_type?:
            Database["public"]["Enums"]["work_related_type"] | null;
          scope?: Database["public"]["Enums"]["work_scope"] | null;
          stage?: Database["public"]["Enums"]["work_stage"] | null;
          subject_organization_id?: string | null;
          title?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "work_items_assigned_to_fkey";
            columns: ["assigned_to"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "work_items_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "work_items_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "work_items_subject_organization_id_fkey";
            columns: ["subject_organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      assignable_profiles: {
        Args: {
          p_org?: string;
          p_scope: Database["public"]["Enums"]["work_scope"];
        };
        Returns: {
          email: string;
          full_name: string;
          id: string;
          role: string;
        }[];
      };
      bootstrap_agency_owner: {
        Args: { p_agency_slug?: string; p_email: string };
        Returns: string;
      };
      can_view_fulfillment_client: {
        Args: { p_org: string };
        Returns: boolean;
      };
      can_view_org: { Args: { p_org: string }; Returns: boolean };
      can_view_work: {
        Args: {
          p_org: string;
          p_scope: Database["public"]["Enums"]["work_scope"];
          p_subject_org: string;
        };
        Returns: boolean;
      };
      can_write_work: {
        Args: {
          p_org: string;
          p_scope: Database["public"]["Enums"]["work_scope"];
        };
        Returns: boolean;
      };
      current_agency_role: {
        Args: never;
        Returns: Database["public"]["Enums"]["agency_role"];
      };
      is_agency_admin: { Args: never; Returns: boolean };
      is_agency_manager_or_above: { Args: never; Returns: boolean };
      is_agency_staff: { Args: never; Returns: boolean };
      is_external_member: { Args: { p_org: string }; Returns: boolean };
      is_org_admin: { Args: { p_org: string }; Returns: boolean };
      is_org_member: { Args: { p_org: string }; Returns: boolean };
      log_audit: {
        Args: {
          p_action: string;
          p_after?: Json;
          p_before?: Json;
          p_entity_id: string;
          p_entity_type: string;
          p_org?: string;
        };
        Returns: undefined;
      };
      merge_organization_branding: {
        Args: { p_org: string; p_patch: Json };
        Returns: Json;
      };
      my_org_ids: { Args: never; Returns: string[] };
      org_role_for: {
        Args: { p_org: string };
        Returns: Database["public"]["Enums"]["org_role"];
      };
      shares_scope_with: { Args: { p_user: string }; Returns: boolean };
    };
    Enums: {
      agency_role:
        | "agency_owner"
        | "agency_admin"
        | "agency_manager"
        | "agency_team_lead"
        | "agency_agent";
      eod_state:
        "draft" | "submitted" | "needs_clarification" | "reviewed" | "approved";
      external_role:
        | "brm"
        | "sales_partner"
        | "referral_partner"
        | "lender"
        | "affiliate"
        | "client";
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
        | "Archived";
      fulfillment_department:
        "Onboarding" | "Dispute" | "Support" | "Complaints" | "Bureau Calling";
      fulfillment_mode: "saas_pulled" | "outsourcing_only";
      fulfillment_round:
        | "Pre-Round"
        | "Round 1"
        | "Round 2"
        | "Round 3"
        | "Round 4+"
        | "Completed";
      membership_kind: "agency" | "organization" | "external";
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
        | "funding_support";
      org_status: "Active" | "Pending Onboarding" | "At Risk" | "Paused";
      outsourcing_group_status: "Active" | "Paused" | "Onboarding";
      product_key: "creditOps" | "fundingOps" | "diyCredit" | "oi" | "crm";
      webhook_delivery_status: "emitted" | "failed" | "skipped";
      webhook_endpoint_type: "ghl" | "disputefox" | "generic";
      work_priority: "Normal" | "High" | "Urgent";
      work_related_type:
        "credit_case" | "funding_deal" | "project" | "support" | "fulfillment";
      work_scope: "AGENCY" | "ORGANIZATION";
      work_stage:
        | "Queued"
        | "Assigned"
        | "In Processing"
        | "Ready for QA"
        | "QA Review"
        | "Completed"
        | "Blocked"
        | "Attention";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      agency_role: [
        "agency_owner",
        "agency_admin",
        "agency_manager",
        "agency_team_lead",
        "agency_agent",
      ],
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
      product_key: ["creditOps", "fundingOps", "diyCredit", "oi", "crm"],
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
} as const;
