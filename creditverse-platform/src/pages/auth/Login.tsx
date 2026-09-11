/**
 * The way into the whole BES platform.
 *
 * ── ONE DOOR, MANY KINDS OF PERSON ─────────────────────────────────────────
 *
 * BES staff, partners, partner staff and clients all sign in here. So the page
 * names the company and not a product: "Credit + Funding Operations" described
 * two of the modules and quietly excluded BES CRM, TalentOps, Agency HQ and
 * both portals. Where somebody lands is decided AFTER authentication, by their
 * memberships — never by which page they opened (Dee, 2026-09-11).
 *
 * ── WHAT THE LAYOUT IS FOR ─────────────────────────────────────────────────
 *
 * Two panels on a desktop: the platform on the left, the form on the right.
 * The left panel carries the systems map — one core, four connected modules —
 * because the thing that makes this page BES rather than another SaaS sign-in
 * is the structure of the business behind it. Below `lg` the map is dropped
 * and the brand collapses to a header: on a phone, the form is the page, and a
 * decorative diagram between a person and their password is an obstacle.
 *
 * ── WHAT IS DELIBERATELY QUIET ─────────────────────────────────────────────
 *
 * Access here is granted, not requested — nearly everybody arrives from an
 * invitation. `Create account` therefore stays available (public sign-up with
 * a trial is a real route) but sits last and small. It is not the call to
 * action on an invite-controlled platform.
 *
 * ── UNCHANGED ──────────────────────────────────────────────────────────────
 *
 * This is a presentation change. The four panels (password · magic link ·
 * sign-up · reset), demo mode, the redirect back to `from`, sign-up's business
 * fields and plan, and every call into `auth-context` are exactly as they
 * were.
 */
import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { Mail, Lock, ArrowRight, Info, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlanPicker } from "@/components/auth/PlanPicker";
import { BesSystemsMap } from "@/components/auth/BesSystemsMap";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth/auth-context";
import { pickOperatorQuote } from "@/lib/brand/operator-quotes";
import { useExternalProviders } from "@/lib/auth/use-external-providers";
import { useSeo } from "@/lib/use-seo";

type Panel = "password" | "magic" | "signup" | "reset";

/** What the form says it is, per panel. One place, so they cannot drift. */
const HEADINGS: Record<Panel, { title: string; blurb: string }> = {
  password: { title: "Welcome back", blurb: "Sign in to your BES workspace." },
  magic: { title: "Email me a link", blurb: "We'll send a one-time sign-in link to your inbox." },
  reset: { title: "Reset your password", blurb: "We'll email you a link to set a new one." },
  signup: { title: "Create your account", blurb: "For a new business starting with BES." },
};

const SUBMIT_LABEL: Record<Panel, string> = {
  password: "Sign in",
  magic: "Send sign-in link",
  reset: "Send reset email",
  signup: "Create account",
};

/**
 * The mark, before there is a session.
 *
 * This page runs BEFORE sign-in, so it cannot read `agencies.branding` — RLS
 * has nobody to answer for yet. The logo comes from the file in `public/`,
 * which is the same fallback `BrandLogo` uses once a session exists, so the
 * two never disagree. If the image is missing the wordmark stands in rather
 * than leaving a gap.
 */
function BrandMark({ size }: { size: "sm" | "lg" }) {
  const [ok, setOk] = useState(true);
  const box = size === "lg" ? "h-12 w-12" : "h-10 w-10";
  if (!ok) {
    return (
      <span
        className={`flex ${box} shrink-0 items-center justify-center rounded-xl bg-gradient-gold text-sm font-black text-charcoal`}
      >
        BES
      </span>
    );
  }
  return (
    <img
      src="/bes-logo.png"
      alt="Blessed Empire Services"
      className={`${box} shrink-0 object-contain`}
      onError={() => setOk(false)}
    />
  );
}

/** Google's mark, in Google's colours — their brand terms require it. */
function GoogleMark() {
  return (
    <svg className="mr-2.5 h-4 w-4" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.0 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.0 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C37.0 40.2 44 35 44 24c0-1.3-.1-2.6-.4-3.9z" />
    </svg>
  );
}

/** Dee's brand panel artwork. Optional: `BesSystemsMap` stands in without it. */
const BRAND_ART = "/bes-login-panel.png";

/** Inputs on a dark surface: the shared ring colour is tuned for light. */
const FIELD =
  "border-white/10 bg-white/[0.04] text-white placeholder:text-white/30 " +
  "focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-charcoal";

const Login = () => {
  const auth = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/app";

  const [panel, setPanel] = useState<Panel>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [plan, setPlan] = useState("creditops");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [artOk, setArtOk] = useState(true);
  /* Chosen once per visit, not on every render: a line that changes while
     somebody is reading it is movement beside a password field. */
  const [quote] = useState(pickOperatorQuote);
  const providers = useExternalProviders();

  useSeo({
    title: "Sign in — BES",
    description: "Sign in to the Blessed Empire Services operating platform.",
    canonical: "/login",
    noindex: true,
  });

  // In demo mode there is no session to return to, so keep this page reachable:
  // it explains how to configure the backend.
  if (auth.mode === "live" && auth.status === "signed-in")
    return <Navigate to={from} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    let result: { error: string | null };
    switch (panel) {
      case "password":
        result = await auth.signInWithPassword(email, password);
        break;
      case "magic":
        result = await auth.signInWithMagicLink(email);
        if (!result.error) setNotice("Check your inbox for a sign-in link.");
        break;
      case "signup":
        result = await auth.signUp(email, password, fullName, { business: { businessName, phone, plan } });
        if (!result.error)
          setNotice(
            "Account created. Confirm your email, then ask an administrator to grant workspace access.",
          );
        break;
      case "reset":
        result = await auth.resetPassword(email);
        if (!result.error) setNotice("Password reset email sent.");
        break;
    }
    setError(result.error);
    setBusy(false);
  };

  const demo = auth.mode === "demo";
  const heading = HEADINGS[panel];

  return (
    <div className="min-h-screen bg-charcoal text-white lg:grid lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      {/* ── The platform ──────────────────────────────────────────────── */}
      <aside className="relative hidden overflow-hidden bg-charcoal-deep lg:flex lg:flex-col lg:p-14">
        {/* Dee's artwork if it has been dropped into `public/`, the systems map
            if it has not. Either way the panel is finished — the page never
            shows a broken image or an empty gold rectangle while a file is in
            transit, which is the same fallback discipline the logo uses. */}
        {artOk ? (
          <img
            src={BRAND_ART}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover object-left"
            onError={() => setArtOk(false)}
          />
        ) : (
          <div className="pointer-events-none absolute inset-x-0 top-[8%] bottom-[38%]">
            {/* Boxed ABOVE the type rather than centred on the panel: centred,
                two of the module cards land underneath the headline and the
                quote — and three modules on a page about four is worse than
                no diagram at all. */}
            <BesSystemsMap className="h-full w-full text-white opacity-70" />
          </div>
        )}

        {/* The type sits in the lower third, so the scrim is weighted there.
            White on gold is unreadable without it (rule 15), and the right
            edge fades into the form panel so the two read as one page. */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-charcoal-deep via-charcoal-deep/55 to-charcoal-deep/25" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-charcoal-deep/80" />

        <div className="relative flex items-center gap-3">
          <BrandMark size="lg" />
          <span className="text-[15px] font-semibold tracking-tight drop-shadow">
            Blessed Empire Services
          </span>
        </div>

        <div className="flex-1" />

        <div className="relative max-w-md">
          <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-gold">
            Process. Systems. People.
          </p>
          <h2 className="mt-5 text-[2rem] font-bold leading-[1.2] tracking-tight xl:text-[2.35rem]">
            One connected operating system for the businesses we build, support, and scale.
          </h2>
          <blockquote className="mt-8 border-l border-gold/40 pl-4 text-[15px] italic leading-relaxed text-white/60">
            “{quote}”
          </blockquote>
          <p className="mt-8 flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-white/35">
            <ShieldCheck className="h-3.5 w-3.5" />
            Protected enterprise access
          </p>
        </div>
      </aside>

      {/* ── The form ──────────────────────────────────────────────────── */}
      <main className="flex min-h-screen flex-col justify-center px-6 py-12 sm:px-10 lg:min-h-0 lg:px-14">
        <div className="mx-auto w-full max-w-sm">
          {/* On a phone the brand panel is gone, so identity comes back here. */}
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-3">
              <BrandMark size="sm" />
              <span className="text-sm font-semibold tracking-tight">Blessed Empire Services</span>
            </div>
            <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.3em] text-gold">
              Process. Systems. People.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-white/50">
              One connected operating system for the businesses we build, support, and scale.
            </p>
          </div>

          {demo ? (
            <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                <div>
                  <p className="font-semibold text-amber-200">Backend not configured</p>
                  <p className="mt-1 text-white/70">
                    No Supabase credentials were found, so the platform is running in{" "}
                    <strong>demo mode</strong> over seed data. Nothing is saved. Copy{" "}
                    <code className="rounded bg-white/10 px-1">.env.example</code> to{" "}
                    <code className="rounded bg-white/10 px-1">.env.local</code> and restart to
                    enable real sign-in.
                  </p>
                </div>
              </div>
              <Button asChild className="w-full bg-gradient-gold text-charcoal hover:opacity-90">
                <Link to="/app">
                  Continue in demo mode <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-7 shadow-2xl shadow-black/40">
                <h1 className="text-2xl font-bold tracking-tight">{heading.title}</h1>
                <p className="mt-1.5 text-sm text-white/50">{heading.blurb}</p>

                <form onSubmit={submit} className="mt-6 space-y-4">
                  {panel === "signup" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="fullName" className="text-white/70">
                        Full name
                      </Label>
                      <Input
                        id="fullName"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        required
                        className={FIELD}
                      />
                      <Label htmlFor="businessName" className="text-white/70">
                        Business / company name
                      </Label>
                      <Input
                        id="businessName"
                        value={businessName}
                        onChange={(e) => setBusinessName(e.target.value)}
                        required
                        maxLength={80}
                        placeholder="Your company as registered"
                        className={FIELD}
                      />
                      <Label htmlFor="phone" className="text-white/70">
                        Business phone
                      </Label>
                      <Input
                        id="phone"
                        type="tel"
                        autoComplete="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="(555) 555-0100"
                        className={FIELD}
                      />
                      <PlanPicker value={plan} onChange={setPlan} />
                      <p className="text-[11px] text-white/45">
                        Your organization is created when you confirm your email. A 30-day
                        introductory trial starts then, unless your business already has an
                        organization with BES.
                      </p>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-white/70">
                      Email
                    </Label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                      <Input
                        id="email"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className={`pl-9 ${FIELD}`}
                      />
                    </div>
                  </div>

                  {(panel === "password" || panel === "signup") && (
                    <div className="space-y-1.5">
                      <Label htmlFor="password" className="text-white/70">
                        Password
                      </Label>
                      <div className="relative">
                        <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                        <Input
                          id="password"
                          type="password"
                          autoComplete={panel === "signup" ? "new-password" : "current-password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          minLength={8}
                          className={`pl-9 ${FIELD}`}
                        />
                      </div>
                    </div>
                  )}

                  {error && (
                    <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                      {error}
                    </p>
                  )}
                  {notice && (
                    <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                      {notice}
                    </p>
                  )}

                  <Button
                    type="submit"
                    disabled={busy}
                    className="h-11 w-full bg-gradient-gold text-[15px] font-semibold text-charcoal hover:opacity-90 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-charcoal"
                  >
                    {busy ? "Please wait…" : SUBMIT_LABEL[panel]}
                  </Button>
                </form>

                {/* Only rendered when Google is actually configured, so there
                    is never a button here that cannot sign anybody in. */}
                {providers.google && panel !== "signup" && (
                  <>
                    <div className="my-5 flex items-center gap-3">
                      <span className="h-px flex-1 bg-white/10" />
                      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/30">
                        or continue with
                      </span>
                      <span className="h-px flex-1 bg-white/10" />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        setError(null);
                        /* Success is a redirect to Google, so nothing after
                           this line runs on the happy path. */
                        const { error: oauthError } = await auth.signInWithGoogle(from);
                        if (oauthError) {
                          setError(oauthError);
                          setBusy(false);
                        }
                      }}
                      className="h-11 w-full border-white/15 bg-white/[0.04] text-[15px] font-medium text-white hover:bg-white/[0.09] hover:text-white focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-charcoal"
                    >
                      <GoogleMark />
                      Continue with Google
                    </Button>
                  </>
                )}

                {/* The other ways in. Same weight as each other, less than the
                    button above — they are alternatives, not the main route. */}
                <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/[0.07] pt-4 text-[13px] text-white/50">
                  {panel !== "password" && (
                    <button type="button" onClick={() => setPanel("password")} className="transition-colors hover:text-white">
                      Use password
                    </button>
                  )}
                  {panel !== "magic" && (
                    <button type="button" onClick={() => setPanel("magic")} className="transition-colors hover:text-white">
                      Email me a link
                    </button>
                  )}
                  {panel !== "reset" && panel !== "signup" && (
                    <button type="button" onClick={() => setPanel("reset")} className="transition-colors hover:text-white">
                      Forgot password
                    </button>
                  )}
                </div>
              </div>

              <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-white/35">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                Secure access for BES team members, partners, and clients
              </p>

              {/* Subordinate on purpose: access here is granted, not requested. */}
              <p className="mt-6 text-center text-xs text-white/30">
                {panel === "signup" ? (
                  <button type="button" onClick={() => setPanel("password")} className="transition-colors hover:text-white/60">
                    Already have an account? Sign in
                  </button>
                ) : (
                  <>
                    Starting a new business with BES?{" "}
                    <button type="button" onClick={() => setPanel("signup")} className="underline underline-offset-2 transition-colors hover:text-white/60">
                      Create an account
                    </button>
                  </>
                )}
              </p>
            </>
          )}

          <p className="mt-8 text-center text-xs text-white/25">
            <Link to="/" className="transition-colors hover:text-white/50">
              ← Back to site
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
};

export default Login;
