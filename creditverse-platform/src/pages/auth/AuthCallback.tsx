/**
 * Landing page for magic-link / email-confirm / recovery redirects.
 * supabase-js consumes the URL tokens (detectSessionInUrl); we just wait for
 * the session and forward the user.
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

const AuthCallback = () => {
  const { status } = useAuth();
  const [params] = useSearchParams();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 8000);
    return () => clearTimeout(t);
  }, []);

  if (status === "signed-in") {
    const next =
      params.get("type") === "recovery"
        ? "/app/settings"
        : safeRedirectPath(params.get("next"));
    return <Navigate to={next} replace />;
  }
  if (status === "signed-out" || timedOut) {
    /* Keep the destination: after signing in they still want to get there. */
    const next = safeRedirectPath(params.get("next"), "");
    return <Navigate to="/login" replace state={next ? { from: next } : undefined} />;
  }
  return <FullScreenSpinner />;
};

export default AuthCallback;
