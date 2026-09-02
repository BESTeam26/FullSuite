/**
 * Landing page for magic-link / email-confirm / recovery redirects.
 * supabase-js consumes the URL tokens (detectSessionInUrl); we just wait for
 * the session and forward the user.
 */
import { useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/lib/auth/auth-context";
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
    return (
      <Navigate
        to={params.get("type") === "recovery" ? "/app/settings" : "/app"}
        replace
      />
    );
  }
  if (status === "signed-out" || timedOut) return <Navigate to="/login" replace />;
  return <FullScreenSpinner />;
};

export default AuthCallback;
