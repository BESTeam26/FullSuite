/**
 * /accept-invitation/:token — the landing for an invitation link. Signed out:
 * go to login and come back here. Signed in: accept_invitation() decides —
 * the caller's email must match the invitation's, and it must be open — then
 * the person lands in the app with the new membership loaded.
 */
import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/auth-context";
import { errorMessage } from "@/lib/data/error-message";
import { acceptInvitation } from "@/lib/data/team-permissions";

export default function AcceptInvitation() {
  const { token } = useParams<{ token: string }>();
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [state, setState] = useState<{ status: "working" | "done" | "error"; message?: string }>({ status: "working" });

  const signedIn = auth.mode === "live" && auth.status === "signed-in";
  useEffect(() => {
    if (!signedIn || !token) return;
    let cancelled = false;
    acceptInvitation(token)
      .then(async () => { await auth.refreshMemberships(); if (!cancelled) { setState({ status: "done" }); navigate("/app", { replace: true }); } })
      .catch((e) => { if (!cancelled) setState({ status: "error", message: errorMessage(e, "This invitation could not be accepted.") }); });
    return () => { cancelled = true; };
  }, [signedIn, token, navigate, auth]);

  if (auth.mode === "live" && auth.status === "signed-out") return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!token) return <Navigate to="/login" replace />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h1 className="flex items-center gap-2 text-lg font-bold text-foreground"><ShieldCheck className="h-5 w-5 text-primary" /> Team invitation</h1>
        {state.status === "working" && <p className="mt-3 inline-flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Checking your invitation…</p>}
        {state.status === "error" && (
          <>
            <p role="alert" className="mt-3 text-sm text-status-danger">{state.message}</p>
            <p className="mt-2 text-xs text-muted-foreground">Invitations are tied to the email address they were sent to and expire after seven days. Sign in with the invited email, or ask your administrator for a new link.</p>
            <Button className="mt-4" size="sm" onClick={() => navigate("/app")}>Go to the app</Button>
          </>
        )}
      </div>
    </div>
  );
}
