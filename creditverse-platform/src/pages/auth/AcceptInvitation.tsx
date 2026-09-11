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
 * The invited ADDRESS is shown and locked, because it is the person's login
 * from then on and the platform already knows it. Asking them to retype it
 * turned a typo into an account on the wrong address and an invitation that
 * silently would not match — a worse failure than the one that secrecy
 * prevented. `invitation_preview` discloses it only for a token that is real,
 * unexpired and unused, and cannot tell those three failures apart.
 *
 * Nothing here decides whether the invitation may be accepted. The database
 * still requires the caller's own authenticated email to match, so a
 * forwarded link is useless to anybody else.
 */
import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { Loader2, Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth/auth-context";
import { cn } from "@/lib/utils";
import { invitationProblem } from "@/lib/auth/invitation-problem";
import { acceptInvitation } from "@/lib/data/team-permissions";
import { acceptAgencyInvitation, fetchInvitationPreview, type InvitationPreview } from "@/lib/data/agency-invitations";
import { acceptPartnerInvitation } from "@/lib/data/agency-partners";

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
    /* One link, three kinds — organization, BES team, partner portal — and
       nobody is asked which sort of invitation they hold: each accept
       function refuses the kinds that are not its own, so they are simply
       tried in order. When every one refuses, the error worth showing is the
       first that was ABOUT this invitation ("sent to a different email
       address"), never a kind-mismatch from a function the token was not
       for. A partner contact lands on the portal — /app has nothing for
       them. */
    (async () => {
      const attempts: Array<[() => Promise<unknown>, string]> = [
        [() => acceptInvitation(token), "/app"],
        [() => acceptAgencyInvitation(token), "/app"],
        [() => acceptPartnerInvitation(token), "/partner"],
      ];
      const kindMismatch = /accepted here|not a team invitation/i;
      let firstRealError: unknown = null;
      for (const [run, destination] of attempts) {
        try {
          await run();
          return destination;
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          if (firstRealError === null && !kindMismatch.test(message)) firstRealError = e;
        }
      }
      throw firstRealError ?? new Error("This invitation link is not valid, or it has already been used.");
    })()
      .then(async (destination) => {
        await auth.refreshMemberships();
        if (!cancelled) navigate(destination, { replace: true });
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
 * The signed-out half. Two doors, one invitation.
 *
 * The address comes from the invitation and cannot be edited: it is the login
 * this person will use, and the invitation works for it alone.
 */
function ActivationForms({ token }: { token: string }) {
  const navigate = useNavigate();
  const auth = useAuth();
  const [door, setDoor] = useState<Door>("activate");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [preview, setPreview] = useState<InvitationPreview | null | "loading" | "gone">("loading");

  useEffect(() => {
    let cancelled = false;
    fetchInvitationPreview(token)
      .then((p) => { if (!cancelled) { setPreview(p ?? "gone"); if (p) setEmail(p.email); } })
      /* A lookup failure is not a dead end: fall back to letting them type it,
         rather than blocking activation on a network hiccup. */
      .catch(() => { if (!cancelled) setPreview(null); });
    return () => { cancelled = true; };
  }, [token]);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /* Set when the account was created and a confirmation email is on its way.
     It replaces the form entirely: a green line under a still-complete form
     reads as "nothing happened", which is exactly how the first real invited
     user read it (P-002). */
  const [confirmSentTo, setConfirmSentTo] = useState<string | null>(null);

  /* Locked only when we actually know the address. A lookup that failed or
     found nothing leaves the field editable rather than blocking activation. */
  const locked = typeof preview === "object" && preview !== null;

  if (preview === "gone") {
    return (
      <div className="mt-3 space-y-2">
        <p role="alert" className="text-sm text-status-danger">
          This invitation is no longer usable.
        </p>
        <p className="text-xs text-muted-foreground">
          It may have expired, or it may already have been used. Invitations last seven days —
          ask whoever invited you to send a new one.
        </p>
      </div>
    );
  }

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
      const { error: err, needsConfirmation } = await auth.signUp(email, password, fullName, {
        redirectPath: `/accept-invitation/${token}`,
      });
      if (!err && needsConfirmation) setConfirmSentTo(email);
      else if (!err) setNotice("Account created — accepting your invitation…");
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

  /* One clear destination after sign-up, instead of a form that looks
     untouched. It says what happened, what to do, and where they land. */
  if (confirmSentTo) {
    return (
      <div className="mt-2 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-status-success/10">
          <Mail className="h-6 w-6 text-status-success" />
        </div>
        <h2 className="mt-3 text-base font-bold text-foreground">Check your email</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Your account is created. We sent a confirmation link to{" "}
          <span className="font-medium text-foreground">{confirmSentTo}</span>.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Open that email and click the link — it brings you straight back here and accepts your
          invitation automatically. You can close this tab.
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Nothing in your inbox after a minute or two? Check your spam folder, then ask whoever
          invited you to send it again.
        </p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/login")}>
          Back to sign in
        </Button>
      </div>
    );
  }

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
            <Input
              id="email"
              type="email"
              autoComplete="email"
              className={cn("pl-9", locked && "cursor-not-allowed bg-muted text-muted-foreground")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              /* Locked when the invitation told us the address: it is this
                 person's login from now on, and the invitation works for it
                 alone. `readOnly` rather than `disabled` so the value is still
                 submitted and screen readers still announce it. */
              readOnly={locked}
              aria-readonly={locked || undefined}
            />
          </div>
          {locked ? (
            <p className="text-xs text-muted-foreground">
              This is the address your invitation was sent to, and the one you will sign in with.
            </p>
          ) : preview === "loading" ? (
            <p className="text-xs text-muted-foreground">Checking your invitation…</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Use the address your invitation was sent to — it only works for that address.
            </p>
          )}
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
