/**
 * Identity bootstrap resolves exactly once per cold boot.
 *
 * The regression this exists to prevent: `loadIdentity` was called from both
 * `getSession()` and `onAuthStateChange`'s `INITIAL_SESSION`, so every cold
 * load issued the four-query identity batch twice — eight requests to learn
 * four things, with the duplicates slowing the originals through contention.
 *
 * These pin the behaviour, not the symptom: they count actual calls to the
 * `profiles` table, so hiding the second batch behind UI state would still
 * fail. Session restoration, sign-out and explicit refresh are covered too,
 * because a dedupe that breaks any of those is not a fix.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";

const USER_A = { id: "user-a" };
const USER_B = { id: "user-b" };

/** Every table read the identity batch performs, in call order. */
let tableCalls: string[] = [];
/** The listener `onAuthStateChange` registered, so tests can drive events. */
let authListener: ((event: string, session: unknown) => void) | null = null;
let storedSession: { user: { id: string } } | null = null;

const makeQuery = (table: string) => {
  const result = Promise.resolve({
    data: table === "profiles" ? { id: "user-a" } : null,
    error: null,
  });
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => result,
    then: (...a: unknown[]) =>
      (
        Promise.resolve({ data: [], error: null }) as unknown as {
          then: (...x: unknown[]) => unknown;
        }
      ).then(...(a as [])),
  };
  return chain;
};

vi.mock("@/lib/supabase/client", () => ({
  authMode: "live",
  siteUrl: "http://localhost",
  isSupabaseConfigured: true,
  supabase: {
    from: (table: string) => {
      tableCalls.push(table);
      return makeQuery(table);
    },
    auth: {
      getSession: () => Promise.resolve({ data: { session: storedSession } }),
      onAuthStateChange: (cb: (e: string, s: unknown) => void) => {
        authListener = cb;
        // supabase-js reports the restored session to every new listener.
        queueMicrotask(() => cb("INITIAL_SESSION", storedSession));
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    },
  },
  requireSupabase: () => ({}),
}));

const { AuthProvider, useAuth } = await import("@/lib/auth/auth-context");

function Probe() {
  const { status, user } = useAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="uid">{user?.id ?? "none"}</span>
    </div>
  );
}

const countOf = (table: string) =>
  tableCalls.filter((t) => t === table).length;

const renderApp = () =>
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );

describe("identity bootstrap", () => {
  beforeEach(() => {
    tableCalls = [];
    authListener = null;
    storedSession = { user: USER_A };
  });

  it("reads each identity table exactly once on a cold boot", async () => {
    renderApp();
    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toBe("signed-in"),
    );
    // Both boot paths ran; neither repeated the batch.
    expect(countOf("profiles")).toBe(1);
    expect(countOf("agency_memberships")).toBe(1);
    expect(countOf("org_memberships")).toBe(1);
    expect(countOf("external_memberships")).toBe(1);
  });

  it("still restores a stored session", async () => {
    renderApp();
    await waitFor(() =>
      expect(screen.getByTestId("uid").textContent).toBe(USER_A.id),
    );
  });

  it("reports signed-out when there is no stored session", async () => {
    storedSession = null;
    renderApp();
    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toBe("signed-out"),
    );
    expect(countOf("profiles")).toBe(0);
  });

  it("does not re-read identity on a token refresh for the same user", async () => {
    renderApp();
    await waitFor(() => expect(countOf("profiles")).toBe(1));
    await act(async () => {
      authListener?.("TOKEN_REFRESHED", { user: USER_A });
    });
    expect(countOf("profiles")).toBe(1);
  });

  it("clears identity on sign-out and reads again for the next user", async () => {
    renderApp();
    await waitFor(() => expect(countOf("profiles")).toBe(1));

    await act(async () => {
      authListener?.("SIGNED_OUT", null);
    });
    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toBe("signed-out"),
    );

    await act(async () => {
      authListener?.("SIGNED_IN", { user: USER_B });
    });
    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toBe("signed-in"),
    );
    // A different user must never be served the previous user's identity.
    expect(countOf("profiles")).toBe(2);
  });
});
