/**
 * Landing page for magic-link, email-confirm, recovery and OAuth redirects.
 *
 * ── WHY THIS PAGE HAS TO BE PATIENT ────────────────────────────────────────
 *
 * Dee, 2026-09-21: "Login via google don't work on the first click, need to
 * refresh again then try again to work."
 *
 * The flow is PKCE, so Google sends the browser back here with `?code=…` and
 * supabase-js exchanges that code for a session ASYNCHRONOUSLY. Meanwhile the
 * auth provider boots, calls `getSession()`, finds nothing stored yet —
 * because the exchange has not finished — and reports `signed-out`.
 *
 * This page used to treat that as the answer and navigate straight to /login,
 * abandoning the code mid-exchange. The second attempt usually won the race,
 * which is exactly the "refresh and try again" Dee described.
 *
 * So: while a `code` is in the URL, `signed-out` is NOT an answer. It is the
 * state before the answer. The page waits for the exchange to finish or for
 * the timeout, and never for longer than the timeout.
 *
 * `?next=` carries where they were going before they had to confirm — an
 * invitation, usually. It arrives from a URL, so it is sanitised: only a path
 * inside this application is honoured, never another origin.
 */
import { useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/lib/auth/auth-context";
import { safeRedirectPath } from "@/lib/auth/safe-redirect";
import { FullScreenSpinner } from "@/components/auth/RequireAuth";

/* Long enough for a slow exchange on a bad connection, short enough that a
   genuinely broken sign-in does not look like a hung page. */
const EXCHANGE_TIMEOUT_MS = 15000;

const AuthCallback = () => {
  const { status } = useAuth();
  const [params] = useSearchParams();
  const [timedOut, setTimedOut] = useState(false);

  /* An OAuth round trip comes back with one of these two. Their presence is
     what tells us an exchange is owed; without them there is nothing to wait
     for and the old behaviour is right. */
  const code = params.get("code");
  const oauthError = params.get("error_description") ?? params.get("error");

  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), EXCHANGE_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, []);

  /* A THIRD state, and the one that stranded people.
   *
   * `unavailable` means the session is real and identity could not be read —
   * a transient query failure on the first sign-in, usually. The callback knew
   * only `signed-in` and `signed-out`, so `unavailable` matched neither, the
   * page span until the timeout and then bounced to /login. The second attempt
   * found the session already stored and worked, which is exactly the
   * first-try/second-try pattern Dee and Bryan both hit.
   *
   * They are signed IN. Sending them back to a login form is asking them to do
   * again the thing they just did. The app has its own handling for an
   * identity it cannot read, and that is where this belongs. */
  if (status === "signed-in" || status === "unavailable") {
    const next =
      params.get("type") === "recovery"
        ? "/app/settings"
        : safeRedirectPath(params.get("next"));
    return <Navigate to={next} replace />;
  }

  /* Google itself refused or the person cancelled. Nothing is in flight. */
  if (oauthError) {
    const next = safeRedirectPath(params.get("next"), "");
    return (
      <Navigate to="/login" replace
        state={{ ...(next ? { from: next } : {}), authError: oauthError }} />
    );
  }

  /* The exchange is still running. Waiting is the whole fix. */
  const awaitingExchange = Boolean(code) && !timedOut;
  if (!awaitingExchange && (status === "signed-out" || timedOut)) {
    const next = safeRedirectPath(params.get("next"), "");
    return (
      <Navigate to="/login" replace
        state={{
          ...(next ? { from: next } : {}),
          ...(code ? { authError: "That sign-in did not complete. Please try again." } : {}),
        }} />
    );
  }
  return <FullScreenSpinner />;
};

export default AuthCallback;
