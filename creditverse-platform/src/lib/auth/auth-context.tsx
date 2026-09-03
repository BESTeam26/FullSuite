/**
 * Auth context — the single source of truth for "who is signed in and what
 * scopes do they hold".
 *
 * live mode : Supabase Auth session + profile + memberships (RLS-enforced).
 * demo mode : no backend configured; boots a fake agency-owner session so the
 *             UI remains explorable over seed data. Clearly flagged in the UI.
 *
 * Authorization decisions in the UI derive from `memberships` here. The
 * database enforces the same rules server-side via RLS, so a tampered client
 * gains nothing.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import {
  authMode,
  siteUrl,
  supabase,
  type AuthMode,
} from "@/lib/supabase/client";
import type { Enums, Tables } from "@/lib/supabase/database.types";

export type Profile = Tables<"profiles">;
export type AgencyMembership = Tables<"agency_memberships">;
export type OrgMembership = Tables<"org_memberships">;
export type ExternalMembership = Tables<"external_memberships">;
export type AgencyRole = Enums<"agency_role">;

export type AuthStatus = "loading" | "signed-out" | "signed-in";

export interface AuthContextValue {
  mode: AuthMode;
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  agencyMembership: AgencyMembership | null;
  orgMemberships: OrgMembership[];
  externalMemberships: ExternalMembership[];
  /** Derived helpers */
  /**
   * The agency this user acts for, from their own membership. Read this rather
   * than hardcoding an id: under white-label resale the same code runs for a
   * different agency, and a constant would write records to the wrong tenant.
   */
  agencyId: string | null;
  isAgencyStaff: boolean;
  agencyRole: AgencyRole | null;
  isAgencyAdmin: boolean;
  hasAnyAccess: boolean;
  displayName: string;
  /** Actions */
  signInWithPassword: [removed]
    email: string,
    password: string,
  ) => Promise<{ error: string | null }>;
  signInWithMagicLink: (email: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
  ) => Promise<{ error: string | null }>;
  resetPassword: [removed]
  signOut: () => Promise<void>;
  refreshMemberships: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/* ------------------------------------------------------------------ */
/* Demo identity (no backend)                                          */
/* ------------------------------------------------------------------ */

const DEMO_USER_ID = "00000000-0000-4000-8000-00000000demo";
const DEMO_AGENCY_ID = "00000000-0000-4000-8000-0000000000a9";

const demoProfile: Profile = {
  id: DEMO_USER_ID,
  email: "owner@bes.demo",
  full_name: "Platform Administrator (demo)",
  avatar_url: null,
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
};

const demoAgencyMembership: AgencyMembership = {
  id: "demo-agency-membership",
  user_id: DEMO_USER_ID,
  agency_id: DEMO_AGENCY_ID,
  role: "agency_owner",
  created_at: new Date(0).toISOString(),
};

/* ------------------------------------------------------------------ */
/* Provider                                                            */
/* ------------------------------------------------------------------ */

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState<AuthStatus>(
    authMode === "demo" ? "signed-in" : "loading",
  );
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(
    authMode === "demo" ? demoProfile : null,
  );
  const [agencyMembership, setAgencyMembership] =
    useState<AgencyMembership | null>(
      authMode === "demo" ? demoAgencyMembership : null,
    );
  const [orgMemberships, setOrgMemberships] = useState<OrgMembership[]>([]);
  const [externalMemberships, setExternalMemberships] = useState<
    ExternalMembership[]
  >([]);

  const loadIdentity = useCallback(async (userId: string) => {
    if (!supabase) return;
    const [p, am, om, em] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase
        .from("agency_memberships")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase.from("org_memberships").select("*").eq("user_id", userId),
      supabase.from("external_memberships").select("*").eq("user_id", userId),
    ]);
    setProfile(p.data ?? null);
    setAgencyMembership(am.data ?? null);
    setOrgMemberships(om.data ?? []);
    setExternalMemberships(em.data ?? []);
  }, []);

  useEffect(() => {
    if (authMode === "demo" || !supabase) return;
    let cancelled = false;

    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      if (data.session?.user) {
        await loadIdentity(data.session.user.id);
        if (!cancelled) setStatus("signed-in");
      } else {
        setStatus("signed-out");
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        setSession(newSession);
        if (newSession?.user) {
          await loadIdentity(newSession.user.id);
          setStatus("signed-in");
        } else {
          setProfile(null);
          setAgencyMembership(null);
          setOrgMemberships([]);
          setExternalMemberships([]);
          setStatus("signed-out");
        }
      },
    );

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [loadIdentity]);

  const signInWithPassword = useCallback(
    async (email: string, password: string) => {
      if (!supabase) return { error: "Backend not configured." };
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      return { error: error?.message ?? null };
    },
    [],
  );

  const signInWithMagicLink = useCallback(async (email: string) => {
    if (!supabase) return { error: "Backend not configured." };
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${siteUrl}/auth/callback` },
    });
    return { error: error?.message ?? null };
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, fullName: string) => {
      if (!supabase) return { error: "Backend not configured." };
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${siteUrl}/auth/callback`,
        },
      });
      return { error: error?.message ?? null };
    },
    [],
  );

  const resetPassword = useCallback(async (email: string) => {
    if (!supabase) return { error: "Backend not configured." };
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl}/auth/callback?type=recovery`,
    });
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  const refreshMemberships = useCallback(async () => {
    if (session?.user) await loadIdentity(session.user.id);
  }, [session, loadIdentity]);

  const value = useMemo<AuthContextValue>(() => {
    const user = session?.user ?? null;
    const isAgencyStaff = agencyMembership !== null;
    const agencyRole = agencyMembership?.role ?? null;
    return {
      mode: authMode,
      status,
      session,
      user,
      profile,
      agencyMembership,
      orgMemberships,
      externalMemberships,
      agencyId: agencyMembership?.agency_id ?? null,
      isAgencyStaff,
      agencyRole,
      isAgencyAdmin:
        agencyRole === "agency_owner" || agencyRole === "agency_admin",
      hasAnyAccess:
        isAgencyStaff ||
        orgMemberships.length > 0 ||
        externalMemberships.length > 0,
      displayName:
        profile?.full_name?.trim() ||
        profile?.email ||
        user?.email ||
        "Signed in",
      signInWithPassword,
      signInWithMagicLink,
      signUp,
      resetPassword,
      signOut,
      refreshMemberships,
    };
  }, [
    status,
    session,
    profile,
    agencyMembership,
    orgMemberships,
    externalMemberships,
    signInWithPassword,
    signInWithMagicLink,
    signUp,
    resetPassword,
    signOut,
    refreshMemberships,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
};
