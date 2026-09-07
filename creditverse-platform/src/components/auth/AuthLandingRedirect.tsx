/**
 * An auth redirect that lands somewhere unexpected still gets home.
 *
 * Supabase sends a confirmation to the project's Site URL when the redirect it
 * was given is not on the allow list — which is how an invited team member
 * ended up on `/?code=…` looking at the marketing page. The allow list is
 * fixed, but a misconfiguration on ANY future environment produces the same
 * shape, and the failure is silent: `detectSessionInUrl` quietly consumes the
 * code, so the person is signed in and stranded rather than told anything.
 *
 * So wherever a code lands, forward it to the callback with its parameters
 * intact. Cheap, and it turns a dead end into a working sign-in.
 */
import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

/** Parameters Supabase puts on an auth redirect. */
const AUTH_PARAMS = ["code", "token_hash", "error_code", "error_description"];

export const AuthLandingRedirect = ({ children }: { children: ReactNode }) => {
  const { search, hash, pathname } = useLocation();
  const params = new URLSearchParams(search);
  const carriesAuth =
    AUTH_PARAMS.some((p) => params.has(p)) ||
    /** Implicit-flow links put the token in the fragment instead. */
    /access_token=|error=/.test(hash);

  if (carriesAuth && pathname !== "/auth/callback") {
    return <Navigate to={`/auth/callback${search}${hash}`} replace />;
  }
  return <>{children}</>;
};
