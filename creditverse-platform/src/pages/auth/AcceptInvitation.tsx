/**
 * /accept-invitation/:token — where an invitation email lands.
 *
 * This is the *activation* page, so it has to work for someone who has never
 * used the platform. Signed out it offers both doors on the spot — create an
 * account, or sign in with one you already have — rather than bouncing to a
 * login page and losing the invitation on the way.
 *
 * Creating an account here never creates an organization: no business details
 * are sent, so the trigger that provisions a workspace on email confirmation
 * does not fire. The person joins the team that invited them and nothing else.
 *
 * Nothing about the invitation is shown before sign-in, and nothing here
 * decides whether it may be accepted. The token alone reveals no one: the
 * database requires the caller's own email to match the invitation, so a
 * forwarded link is useless to anybody else.
 */
import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { Loader2, Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth/auth-context";
import { invitationProblem } from "@/lib/auth/invitation-problem";
import { acceptInvitation } from "@/lib/data/team-permissions";
import { acceptAgencyInvitation } from "@/lib/data/agency-invitations";

type Door = "activate" | "signin";

/** A link that is not even shaped like a token never reaches the database. */
const TOKEN_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function AcceptInvitation() {
  const { token } = useParams<{ token: string }>();
  const auth = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<{ status: "working" | "error"; message?: string }>({ status: "working" });

  const signedIn = auth.mode === "live" && auth.status === "signed-in";

  const wellFormed = !!token && TOKEN_SHAPE.test(token);

  useEffect(() => {
    if (!signedIn || !wellFormed) return;
    let cancelled = false;
    /* One link, two kinds. An organization invitation is the common case, so
       it is tried first; a team invitation to BES itself is refused by that
       function ("Only organization invitations"), and answered by its sibling
       rather than by asking the person which sort of invitation they hold. */
    acceptInvitation(token)
      .catch(() => acceptAgencyInvitation(token))
      .then(async () => {
        await auth.refreshMemberships();
        if (!cancelled) navigate("/app", { replace: true });
      })
      .catch((e) => {
        if (!cancelled) setState({ status: "error", message: invitationProblem(e) });
      });
    return () => { cancelled = true; };
  }, [signedIn, wellFormed, token, navigate, auth]);

  if (!token) return <Navigate to="/login" replace />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h1 className="flex items-center gap-2 text-lg font-bold text-foreground">
          <ShieldCheck className="h-5 w-5 text-primary" /> Activate your account
        </h1>

        {auth.status === "loading" ? (
          <p className="mt-3 inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> One moment…
          </p>
        ) : !wellFormed ? (
          <>
            <p role="alert" className="mt-3 text-sm text-status-danger">This invitation link is not valid.</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Check that the whole link came through — some email programs break long links across lines — or ask
              whoever invited you for a new one.
            </p>
          </>
        ) : signedIn ? (
          state.status === "error" ? (
            <>
              <p role="alert" className="mt-3 text-sm text-status-danger">{state.message}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                An invitation only works for the email address it was sent to, and it lasts seven days. Sign in with
                that address, or ask whoever invited you for a new link.
              </p>
              <Button className="mt-4" size="sm" onClick={() => navigate("/app")}>Go to the app</Button>
            </>
          ) : (
            <p className="mt-3 inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking your invitation…
            </p>
          )
        ) : (
          <ActivationForms token={token} />
        )}
      </div>
    </div>
  );
}

/**
 * The signed-out half. Two doors, one invitation. The email address is typed
 * rather than shown, because the invitation cannot be read before sign-in —
 * which is the point: the link identifies nobody on its own.
 */
function ActivationForms({ token }: { token: string }) {
  const auth = useAuth();
  const [door, setDoor] = useState<Door>("activate");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (auth.mode === "demo") {
    return (
      <p className="mt-3 text-sm text-muted-foreground">
        Invitations need the backend connected. This copy of the app is running without it.
      </p>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    if (door === "activate") {
      /* No business details: this person is joining an existing team, so no
         organization and no trial is created for them. The confirmation link
         comes back to this invitation instead of a generic landing page. */
      const { error: err } = await auth.signUp(email, password, fullName, {
        redirectPath: `/accept-invitation/${token}`,
      });
      if (!err) setNotice("Almost there — open the confirmation email we just sent, and your invitation is accepted automatically.");
      setError(err);
    } else {
      const { error: err } = await auth.signInWithPassword(email, password);
      setError(err);
    }
    setBusy(false);
  };

  const tab = (value: Door, label: string) => (
    <button
      type="button"
      onClick={() => { setDoor(value); setError(null); setNotice(null); }}
      aria-pressed={door === value}
      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-primary ${
        door === value
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );

  return (
    <>
      <p className="mt-2 text-sm text-muted-foreground">
        Use the email address your invitation was sent to — it only works for that address.
      </p>

      <div className="mt-4 flex gap-2">
        {tab("activate", "Create my account")}
        {tab("signin", "I already have one")}
      </div>

      <form className="mt-4 space-y-3" onSubmit={submit}>
        {door === "activate" && (
          <div className="space-y-1.5">
            <Label htmlFor="fullName">Your full name</Label>
            <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required autoComplete="name" />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="email" type="email" autoComplete="email" className="pl-9" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">{door === "activate" ? "Choose a password" : "Password"}</Label>
          <Input
            id="password"
            type="password"
            autoComplete={door === "activate" ? "new-password" : "current-password"}
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {door === "activate" && <p className="text-[11px] text-muted-foreground">At least 8 characters.</p>}
        </div>

        {error && <p role="alert" className="text-xs text-status-danger">{error}</p>}
        {notice && <p role="status" className="text-xs text-status-success">{notice}</p>}

        <Button type="submit" className="w-full" disabled={busy}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {door === "activate" ? "Activate my account" : "Sign in and accept"}
        </Button>
      </form>

      <p className="mt-3 text-[11px] text-muted-foreground">
        Invitations last seven days. If yours has expired, ask whoever invited you to send a new one.
      </p>
    </>
  );
}
