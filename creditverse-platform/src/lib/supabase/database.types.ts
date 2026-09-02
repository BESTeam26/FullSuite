/**
 * Database types for the public schema.
 *
 * HAND-WRITTEN to match supabase/migrations/20260902000100_tenancy_and_rbac.sql.
 * Once a hosted project exists, regenerate with:
 *
 *   npx supabase gen types typescript --project-id <ref> --schema public \
 *     > src/lib/supabase/database.types.ts
 *
 * Keep the shape identical to the generator's output so the swap is a no-op.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Timestamp = string;

export type Database = {
  public: {
    Tables: {
      agencies: {
        Row: {
          id: string;
          name: string;
          slug: string;
          branding: Json;
          created_at: Timestamp;
          updated_at: Timestamp;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          branding?: Json;
          created_at?: Timestamp;
          updated_at?: Timestamp;
        };
        Update: Partial<Database["public"]["Tables"]["agencies"]["Insert"]>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          created_at: Timestamp;
          updated_at: Timestamp;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          avatar_url?: string | null;
          created_at?: Timestamp;
          updated_at?: Timestamp;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      organizations: {
        Row: {
          id: string;
          agency_id: string;
          name: string;
          code: string;
          principal_name: string;
          principal_email: string;
          address: string | null;
          status: Database["public"]["Enums"]["org_status"];
          is_fulfillment_subscriber: boolean;
          branding: Json;
          joined_at: string;
          created_at: Timestamp;
          updated_at: Timestamp;
        };
        Insert: {
          id?: string;
          agency_id: string;
          name: string;
          code: string;
          principal_name: string;
          principal_email: string;
          address?: string | null;
          status?: Database["public"]["Enums"]["org_status"];
          is_fulfillment_subscriber?: boolean;
          branding?: Json;
          joined_at?: string;
          created_at?: Timestamp;
          updated_at?: Timestamp;
        };
        Update: Partial<Database["public"]["Tables"]["organizations"]["Insert"]>;
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
      businesses: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          legal_name: string | null;
          ein_last4: string | null;
          industry: string | null;
          time_in_business_months: number | null;
          monthly_revenue: number | null;
          created_at: Timestamp;
          updated_at: Timestamp;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          legal_name?: string | null;
          ein_last4?: string | null;
          industry?: string | null;
          time_in_business_months?: number | null;
          monthly_revenue?: number | null;
          created_at?: Timestamp;
          updated_at?: Timestamp;
        };
        Update: Partial<Database["public"]["Tables"]["businesses"]["Insert"]>;
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
      product_entitlements: {
        Row: {
          organization_id: string;
          product: Database["public"]["Enums"]["product_key"];
          enabled: boolean;
          updated_at: Timestamp;
        };
        Insert: {
          organization_id: string;
          product: Database["public"]["Enums"]["product_key"];
          enabled?: boolean;
          updated_at?: Timestamp;
        };
        Update: Partial<
          Database["public"]["Tables"]["product_entitlements"]["Insert"]
        >;
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
      agency_memberships: {
        Row: {
          id: string;
          user_id: string;
          agency_id: string;
          role: Database["public"]["Enums"]["agency_role"];
          created_at: Timestamp;
        };
        Insert: {
          id?: string;
          user_id: string;
          agency_id: string;
          role?: Database["public"]["Enums"]["agency_role"];
          created_at?: Timestamp;
        };
        Update: Partial<
          Database["public"]["Tables"]["agency_memberships"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "agency_memberships_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agency_memberships_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
        ];
      };
      org_memberships: {
        Row: {
          id: string;
          user_id: string;
          organization_id: string;
          role: Database["public"]["Enums"]["org_role"];
          product: Database["public"]["Enums"]["product_key"] | null;
          assigned_only: boolean;
          team_scope: string | null;
          created_at: Timestamp;
        };
        Insert: {
          id?: string;
          user_id: string;
          organization_id: string;
          role: Database["public"]["Enums"]["org_role"];
          product?: Database["public"]["Enums"]["product_key"] | null;
          assigned_only?: boolean;
          team_scope?: string | null;
          created_at?: Timestamp;
        };
        Update: Partial<Database["public"]["Tables"]["org_memberships"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "org_memberships_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "org_memberships_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      external_memberships: {
        Row: {
          id: string;
          user_id: string;
          organization_id: string;
          role: Database["public"]["Enums"]["external_role"];
          created_at: Timestamp;
        };
        Insert: {
          id?: string;
          user_id: string;
          organization_id: string;
          role: Database["public"]["Enums"]["external_role"];
          created_at?: Timestamp;
        };
        Update: Partial<
          Database["public"]["Tables"]["external_memberships"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "external_memberships_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "external_memberships_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      record_grants: {
        Row: {
          id: string;
          external_membership_id: string;
          record_type: string;
          record_id: string;
          granted_by: string | null;
          created_at: Timestamp;
        };
        Insert: {
          id?: string;
          external_membership_id: string;
          record_type: string;
          record_id: string;
          granted_by?: string | null;
          created_at?: Timestamp;
        };
        Update: Partial<Database["public"]["Tables"]["record_grants"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "record_grants_external_membership_id_fkey";
            columns: ["external_membership_id"];
            isOneToOne: false;
            referencedRelation: "external_memberships";
            referencedColumns: ["id"];
          },
        ];
      };
      invitations: {
        Row: {
          id: string;
          email: string;
          kind: Database["public"]["Enums"]["membership_kind"];
          agency_id: string | null;
          organization_id: string | null;
          agency_role: Database["public"]["Enums"]["agency_role"] | null;
          org_role: Database["public"]["Enums"]["org_role"] | null;
          external_role: Database["public"]["Enums"]["external_role"] | null;
          token: string;
          invited_by: string | null;
          expires_at: Timestamp;
          accepted_at: Timestamp | null;
          created_at: Timestamp;
        };
        Insert: {
          id?: string;
          email: string;
          kind: Database["public"]["Enums"]["membership_kind"];
          agency_id?: string | null;
          organization_id?: string | null;
          agency_role?: Database["public"]["Enums"]["agency_role"] | null;
          org_role?: Database["public"]["Enums"]["org_role"] | null;
          external_role?: Database["public"]["Enums"]["external_role"] | null;
          token?: string;
          invited_by?: string | null;
          expires_at?: Timestamp;
          accepted_at?: Timestamp | null;
          created_at?: Timestamp;
        };
        Update: Partial<Database["public"]["Tables"]["invitations"]["Insert"]>;
        Relationships: [];
      };
      user_preferences: {
        Row: {
          user_id: string;
          pinned_org_ids: string[];
          recent_org_ids: string[];
          updated_at: Timestamp;
        };
        Insert: {
          user_id: string;
          pinned_org_ids?: string[];
          recent_org_ids?: string[];
          updated_at?: Timestamp;
        };
        Update: Partial<
          Database["public"]["Tables"]["user_preferences"]["Insert"]
        >;
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: number;
          actor_id: string | null;
          agency_id: string | null;
          organization_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          before: Json | null;
          after: Json | null;
          created_at: Timestamp;
        };
        Insert: {
          actor_id?: string | null;
          agency_id?: string | null;
          organization_id?: string | null;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          before?: Json | null;
          after?: Json | null;
          created_at?: Timestamp;
        };
        Update: Partial<Database["public"]["Tables"]["audit_log"]["Insert"]>;
        Relationships: [];
      };
      work_items: {
        Row: {
          id: string;
          scope: Database["public"]["Enums"]["work_scope"];
          organization_id: string | null;
          subject_organization_id: string | null;
          related_type: Database["public"]["Enums"]["work_related_type"];
          related_ref: string | null;
          title: string;
          description: string | null;
          stage: Database["public"]["Enums"]["work_stage"];
          priority: Database["public"]["Enums"]["work_priority"];
          assigned_to: string | null;
          created_by: string | null;
          due_at: Timestamp | null;
          completed_at: Timestamp | null;
          created_at: Timestamp;
          updated_at: Timestamp;
        };
        Insert: {
          id?: string;
          scope: Database["public"]["Enums"]["work_scope"];
          organization_id?: string | null;
          subject_organization_id?: string | null;
          related_type: Database["public"]["Enums"]["work_related_type"];
          related_ref?: string | null;
          title: string;
          description?: string | null;
          stage?: Database["public"]["Enums"]["work_stage"];
          priority?: Database["public"]["Enums"]["work_priority"];
          assigned_to?: string | null;
          created_by?: string | null;
          due_at?: Timestamp | null;
          completed_at?: Timestamp | null;
          created_at?: Timestamp;
          updated_at?: Timestamp;
        };
        Update: Partial<Database["public"]["Tables"]["work_items"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "work_items_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "work_items_assigned_to_fkey";
            columns: ["assigned_to"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      activity_events: {
        Row: {
          id: number;
          organization_id: string | null;
          entity_type: string;
          entity_id: string;
          actor_id: string | null;
          actor_name: string | null;
          action: string;
          detail: string | null;
          field: string | null;
          previous_value: string | null;
          new_value: string | null;
          pinned: boolean;
          mark: string | null;
          created_at: Timestamp;
        };
        Insert: {
          organization_id?: string | null;
          entity_type: string;
          entity_id: string;
          actor_id?: string | null;
          actor_name?: string | null;
          action: string;
          detail?: string | null;
          field?: string | null;
          previous_value?: string | null;
          new_value?: string | null;
          pinned?: boolean;
          mark?: string | null;
          created_at?: Timestamp;
        };
        Update: Partial<Database["public"]["Tables"]["activity_events"]["Insert"]>;
        Relationships: [];
      };
      files: {
        Row: {
          id: string;
          organization_id: string | null;
          entity_type: string | null;
          entity_id: string | null;
          bucket: string;
          path: string;
          name: string;
          mime_type: string | null;
          size_bytes: number | null;
          sha256: string | null;
          uploaded_by: string | null;
          created_at: Timestamp;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          entity_type?: string | null;
          entity_id?: string | null;
          bucket?: string;
          path: string;
          name: string;
          mime_type?: string | null;
          size_bytes?: number | null;
          sha256?: string | null;
          uploaded_by?: string | null;
          created_at?: Timestamp;
        };
        Update: Partial<Database["public"]["Tables"]["files"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: {
      work_attention: {
        Row: Database["public"]["Tables"]["work_items"]["Row"] & {
          attention_reason: "blocked" | "overdue" | "sla_risk" | null;
          hours_remaining: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      current_agency_role: {
        Args: Record<PropertyKey, never>;
        Returns: Database["public"]["Enums"]["agency_role"] | null;
      };
      is_agency_staff: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_agency_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_agency_manager_or_above: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_org_member: { Args: { p_org: string }; Returns: boolean };
      is_org_admin: { Args: { p_org: string }; Returns: boolean };
      can_view_org: { Args: { p_org: string }; Returns: boolean };
      my_org_ids: { Args: Record<PropertyKey, never>; Returns: string[] };
      can_view_work: {
        Args: {
          p_scope: Database["public"]["Enums"]["work_scope"];
          p_org: string | null;
          p_subject_org: string | null;
        };
        Returns: boolean;
      };
      assignable_profiles: {
        Args: {
          p_scope: Database["public"]["Enums"]["work_scope"];
          p_org?: string | null;
        };
        Returns: {
          id: string;
          full_name: string | null;
          email: string;
          role: string;
        }[];
      };
      log_audit: {
        Args: {
          p_action: string;
          p_entity_type: string;
          p_entity_id: string;
          p_org?: string | null;
          p_before?: Json | null;
          p_after?: Json | null;
        };
        Returns: undefined;
      };
    };
    Enums: {
      org_status: "Active" | "Pending Onboarding" | "At Risk" | "Paused";
      product_key: "creditOps" | "fundingOps" | "diyCredit" | "oi" | "crm";
      agency_role:
        | "agency_owner"
        | "agency_admin"
        | "agency_manager"
        | "agency_team_lead"
        | "agency_agent";
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
      external_role:
        | "brm"
        | "sales_partner"
        | "referral_partner"
        | "lender"
        | "affiliate"
        | "client";
      membership_kind: "agency" | "organization" | "external";
      work_scope: "AGENCY" | "ORGANIZATION";
      work_related_type:
        | "credit_case"
        | "funding_deal"
        | "project"
        | "support"
        | "fulfillment";
      work_stage:
        | "Queued"
        | "Assigned"
        | "In Processing"
        | "Ready for QA"
        | "QA Review"
        | "Completed"
        | "Blocked"
        | "Attention";
      work_priority: "Normal" | "High" | "Urgent";
    };
    CompositeTypes: Record<never, never>;
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type Views<T extends keyof Database["public"]["Views"]> =
  Database["public"]["Views"][T]["Row"];
export type Enums<T extends keyof Database["public"]["Enums"]> =
  Database["public"]["Enums"][T];
