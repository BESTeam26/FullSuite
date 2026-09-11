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
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import {
  authMode,
  supabase,
  type AuthMode,
} from "@/lib/supabase/client";
import type { Enums, Tables } from "@/lib/supabase/database.types";
import { authCallbackUrl, safeRedirectPath } from "@/lib/auth/safe-redirect";

export type Profile = Tables<"profiles">;
export type AgencyMembership = Tables<"agency_memberships">;
export type OrgMembership = Tables<"org_memberships">;
export type ExternalMembership = Tables<"external_memberships">;
export type TeamMembership = Tables<"team_memberships">;
export type AgencyRole = Enums<"agency_role">;
export type AccessScope = Enums<"access_scope">;

export type AuthStatus = "loading" | "signed-out" | "signed-in";

export interface SignUpOptions {
  /** Present only for self-serve sign-up: the organization and its trial are
   *  provisioned from these when the email is confirmed. Omit it when the
   *  person is joining a team that already exists. */
  business?: { businessName: string; phone?: string; plan: string };
  /** Where the confirmation link should land, e.g. back on an invitation.
   *  Sanitised — only a path inside this application is honoured. */
  redirectPath?: string;
}

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
  /** Ownership is a system attribute on the membership, not a role (0234). */
  isAgencyOwner: boolean;
  agencyRole: AgencyRole | null;
  isAgencyAdmin: boolean;
  /**
   * Person-level scope, read from the membership the database enforces with.
   * The interface uses this to LABEL and to avoid offering what will be
   * refused; it never decides access — RLS does (rule 3: both layers, every
   * time). `null` when the user is not BES staff.
   */
  agencyScope: AccessScope | null;
  /** Teams this user sits on, and the subset they lead. Stable ids only. */
  teamIds: string[];
  ledTeamIds: string[];
  hasAnyAccess: boolean;
  displayName: string;
  /** Actions */
  signInWithPassword: (
    email: string,
    password: string,
  ) => Promise<{ error: string | null }>;
  signInWithMagicLink: (email: string, redirectPath?: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    options?: SignUpOptions,
  ) => Promise<{ error: string | null; needsConfirmation?: boolean }>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
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
  is_fixture: false,
  preferred_name: null,
  title: null,
  phone: null,
  birth_month: null,
  birth_day: null,
  birthday_visible: false,
  avatar_url: null,
  avatar_path: null,
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
};

const demoAgencyMembership: AgencyMembership = {
  id: "demo-agency-membership",
  user_id: DEMO_USER_ID,
  agency_id: DEMO_AGENCY_ID,
  role: "agency_admin",
  access_profile: null,
  is_owner: true,
  // Demo explores the whole agency; mirrors the columns migration 0021 added.
  scope: "agency",
  scope_division: null,
  scope_department_id: null,
  status: "active",
  deactivated_at: null,
  deactivated_by: null,
  job_title: null,
  manager_id: null,
  primary_team_id: null,
  primary_department_id: null,
  primary_division_id: null,
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
  const [teamMemberships, setTeamMemberships] = useState<TeamMembership[]>([]);

  const readIdentity = useCallback(async (userId: string) => {
    if (!supabase) return;
    /* Team roster rides in the same parallel batch as the rest of identity —
       one round, resolved once per session, no waterfall (rule 14). */
    const [p, am, om, em, tm] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase
        .from("agency_memberships")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase.from("org_memberships").select("*").eq("user_id", userId),
      supabase.from("external_memberships").select("*").eq("user_id", userId),
      supabase.from("team_memberships").select("*").eq("user_id", userId),
    ]);
    setProfile(p.data ?? null);
    setAgencyMembership(am.data ?? null);
    setOrgMemberships(om.data ?? []);
    setExternalMemberships(em.data ?? []);
    setTeamMemberships(tm.data ?? []);
  }, []);

  /**
   * The identity resolution currently in flight, or the last one that
   * succeeded, keyed by the user it describes.
   *
   * Both boot paths below need the same four records: `getSession()` restores
   * the stored session, and `onAuthStateChange` independently reports
   * `INITIAL_SESSION` for it. Left alone they each issue the batch, so a cold
   * load spends eight requests to learn four things, and the duplicates slow
   * the originals down through contention (rule 14).
   *
   * Sharing one promise per user id makes whichever path arrives second await
   * the first rather than repeat it — a dedupe of the request itself, not of
   * the symptom. It also absorbs `TOKEN_REFRESHED`, which reports the same
   * user and needs no membership re-read.
   */
  const identityRef = useRef<{
    userId: string;
    promise: Promise<void>;
  } | null>(null);

  const loadIdentity = useCallback(
    (userId: string, force = false): Promise<void> => {
      const cached = identityRef.current;
      if (!force && cached?.userId === userId) return cached.promise;

      const promise = readIdentity(userId).catch((err) => {
        // A failure is never cached: the next caller must be able to retry
        // rather than inherit a permanently broken identity.
        if (identityRef.current?.promise === promise) identityRef.current = null;
        throw err;
      });
      identityRef.current = { userId, promise };
      return promise;
    },
    [readIdentity],
  );

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
          identityRef.current = null;
          setProfile(null);
          setAgencyMembership(null);
          setOrgMemberships([]);
          setExternalMemberships([]);
          setTeamMemberships([]);
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

  const signInWithMagicLink = useCallback(async (email: string, redirectPath?: string) => {
    if (!supabase) return { error: "Backend not configured." };
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: authCallbackUrl({ next: redirectPath }) },
    });
    return { error: error?.message ?? null };
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, fullName: string, options?: SignUpOptions) => {
      if (!supabase) return { error: "Backend not configured." };
      // Nothing is created here. The database provisions the organization,
      // membership, entitlements and trial when the email is confirmed — and
      // only when `business` is present, so someone joining a team that already
      // exists does not get an organization of their own.
      const business = options?.business;
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            ...(business
              ? { business_name: business.businessName.trim(), phone: business.phone?.trim() || null, plan: business.plan }
              : {}),
          },
          emailRedirectTo: authCallbackUrl({ next: options?.redirectPath }),
        },
      });
      /* Whether the person still has to open a confirmation email, reported
         rather than inferred: Supabase returns a user with NO session when
         confirmation is required, and a session when it is not. A caller that
         cannot tell the difference has to guess what to say next, and guessing
         wrong leaves somebody staring at a form that looks like it failed. */
      const needsConfirmation = !error && !data.session && !!data.user;
      return { error: error?.message ?? null, needsConfirmation };
    },
    [],
  );

  const resetPassword = useCallback(async (email: string) => {
    if (!supabase) return { error: "Backend not configured." };
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: authCallbackUrl({ recovery: true }),
    });
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  const refreshMemberships = useCallback(async () => {
    // Explicit refresh bypasses the dedupe: the caller is asking precisely
    // because memberships may have changed since they were read.
    if (session?.user) await loadIdentity(session.user.id, true);
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
      /* 0234: ownership is the flag; the retired role value is tolerated so an
         old row fails toward the truth it encoded. */
      isAgencyOwner:
        agencyMembership?.is_owner === true || agencyRole === "agency_owner",
      agencyScope: agencyMembership?.scope ?? null,
      teamIds: teamMemberships.map((t) => t.team_id),
      ledTeamIds: teamMemberships.filter((t) => t.is_lead).map((t) => t.team_id),
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
    teamMemberships,
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
