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
 * ── THE LAYOUT ─────────────────────────────────────────────────────────────
 *
 * Dee's own design, carried across from the BES Company Hub: a dark brand half
 * and a Cloud Sand half, split down the middle. The colours are not new — the
 * cream is `--background`, the button is `--primary`, the charcoal is
 * `--foreground`. The page that felt like a default auth template was one that
 * ignored the palette the rest of the product already uses.
 *
 * Below `lg` the brand half is dropped and its identity moves above the form.
 * On a phone the form is the page; a picture between somebody and their
 * password is an obstacle.
 *
 * ── WHAT IS DELIBERATELY QUIET ─────────────────────────────────────────────
 *
 * Access here is granted, not requested — nearly everybody arrives from an
 * invitation. Sign-up stays reachable and stops being a call to action.
 *
 * ── UNCHANGED ──────────────────────────────────────────────────────────────
 *
 * Presentation only. The four panels (password · magic link · sign-up ·
 * reset), demo mode, the redirect back to `from`, sign-up's business fields
 * and plan, and every call into `auth-context` behave exactly as before.
 */
import { useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { Mail, Lock, ArrowRight, Info, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlanPicker } from "@/components/auth/PlanPicker";
import { BesSystemsMap } from "@/components/auth/BesSystemsMap";
import { usePointerSpotlight } from "@/components/auth/use-pointer-spotlight";
import { BrandPanelSmoke } from "@/components/auth/BrandPanelSmoke";
import { pickOperatorQuote } from "@/lib/brand/operator-quotes";
import { useExternalProviders } from "@/lib/auth/use-external-providers";
import { useAuth } from "@/lib/auth/auth-context";
import { useSeo } from "@/lib/use-seo";

type Panel = "password" | "magic" | "signup" | "reset";

/** What the form says it is, per panel. One place, so they cannot drift. */
const HEADINGS: Record<Panel, { title: string; blurb: string }> = {
  password: { title: "Welcome Back", blurb: "Sign in to your account" },
  magic: { title: "Email me a link", blurb: "We'll send a one-time sign-in link to your inbox" },
  reset: { title: "Reset your password", blurb: "We'll email you a link to set a new one" },
  signup: { title: "Create your account", blurb: "For a new business starting with BES" },
};

const SUBMIT_LABEL: Record<Panel, string> = {
  password: "Sign In",
  magic: "Send sign-in link",
  reset: "Send reset email",
  signup: "Create account",
};

/** Dee's brand artwork. Optional: `BesSystemsMap` stands in without it. */
const BRAND_ART = "/bes-login-panel.webp";

/**
 * The shape of the light the pointer carries: opaque at the centre so the
 * artwork is fully clear there, feathered to nothing by 70% so there is no
 * visible edge to the circle. `--spot-x` / `--spot-y` are written by
 * `usePointerSpotlight`; the 50% fallback keeps it centred before the pointer
 * has ever moved.
 */
const SPOTLIGHT_MASK =
  "radial-gradient(circle 210px at var(--spot-x, 50%) var(--spot-y, 50%), #000 0%, #000 32%, transparent 70%)";

/** Google's mark, in Google's colours — their brand terms require it. */
function GoogleMark() {
  return (
    <svg className="mr-2.5 h-[18px] w-[18px]" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.0 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.0 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C37.0 40.2 44 35 44 24c0-1.3-.1-2.6-.4-3.9z" />
    </svg>
  );
}

/**
 * The mark, before there is a session.
 *
 * This page runs BEFORE sign-in, so it cannot read `agencies.branding` — RLS
 * has nobody to answer for yet. The logo comes from the file in `public/`,
 * which is the same fallback `BrandLogo` uses once a session exists, so the
 * two never disagree. If the image is missing the wordmark stands in.
 */
function BrandMark({ tone }: { tone: "dark" | "light" }) {
  const [ok, setOk] = useState(true);
  return (
    <span className="flex items-center gap-2.5">
      {ok ? (
        <img
          src="/bes-logo.png"
          alt=""
          aria-hidden="true"
          className="h-8 w-8 shrink-0 object-contain"
          onError={() => setOk(false)}
        />
      ) : (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-gold text-[11px] font-black text-charcoal">
          BES
        </span>
      )}
      <span
        className={
          tone === "dark"
            ? "text-[15px] font-semibold tracking-tight text-white"
            : "text-[15px] font-semibold tracking-tight text-foreground"
        }
      >
        Blessed Empire Services
      </span>
    </span>
  );
}

/** Small uppercase field label, as on the Hub. */
function FieldLabel({
  htmlFor,
  children,
  aside,
}: {
  htmlFor: string;
  children: string;
  aside?: ReactNode;
}) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between">
      <label
        htmlFor={htmlFor}
        className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
      >
        {children}
      </label>
      {aside}
    </div>
  );
}

const FIELD =
  "h-11 border-border bg-card pl-10 text-foreground placeholder:text-muted-foreground/60 " +
  "focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-offset-0";

const Login = () => {
  const auth = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/app";

  const [panel, setPanel] = useState<Panel>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
  const spotlight = usePointerSpotlight();

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

  const google = async () => {
    setBusy(true);
    setError(null);
    /* Success is a redirect to Google, so nothing below runs on that path. */
    const { error: oauthError } = await auth.signInWithGoogle(from);
    if (oauthError) {
      setError(oauthError);
      setBusy(false);
    }
  };

  const demo = auth.mode === "demo";
  const heading = HEADINGS[panel];
  const wantsPassword = panel === "password" || panel === "signup";

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-2">
      {/* ── The brand half ────────────────────────────────────────────── */}
      {/*
        The layer stack is Dee's, carried over from the Company Hub: artwork,
        vignette, heavy scrim, faint brand tint, then the type. The artwork is
        meant to be felt rather than looked at — at rest the scrim holds it at
        the edge of visible so the quote is the only thing with contrast.
        `object-left` keeps the gold half in frame: the artwork is 16:9 and
        this panel is portrait, so centring it would crop to the seam.

        The reveal is the one addition. Hovering the panel lifts the scrim and
        eases the artwork up a few percent, over most of a second — slow enough
        to read as the picture surfacing rather than a state flipping. It is
        decoration on a decoration: `motion-reduce` holds both still, and the
        panel is hidden entirely below `lg`, so nothing on a phone or for
        somebody who asked for less movement depends on it.
      */}
      <aside
        ref={spotlight.ref as React.RefObject<HTMLElement>}
        onPointerMove={spotlight.onPointerMove}
        className="group relative hidden overflow-hidden bg-charcoal-deep lg:flex lg:flex-col lg:justify-between lg:p-12"
      >
        {artOk ? (
          <img
            src={BRAND_ART}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full scale-105 object-cover object-left"
            onError={() => setArtOk(false)}
          />
        ) : (
          <div className="pointer-events-none absolute inset-x-0 bottom-[6%] top-[6%]">
            <BesSystemsMap className="h-full w-full text-white opacity-40" />
          </div>
        )}

        {/* Vignette: pulls the eye to the centre, where the quote sits. */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(520px, transparent 0%, transparent 45%, hsl(var(--charcoal-deep) / 0.55) 78%, hsl(var(--charcoal-deep) / 0.92) 100%)",
          }}
        />

        {/* The scrim, and the thing that lifts on hover. White type over gold
            is unreadable without it, so it never leaves entirely. */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, hsl(var(--charcoal-deep) / 0.95) 0%, hsl(var(--charcoal-deep) / 0.88) 50%, hsl(var(--charcoal-deep) / 0.95) 100%)",
          }}
        />

        {/* BES green and gold, at a level you would only notice if it went. */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            background:
              "radial-gradient(at 25% 15%, hsl(var(--green)) 0%, transparent 55%), radial-gradient(at 75% 85%, hsl(var(--gold)) 0%, transparent 45%)",
          }}
        />

        {/* THE SPOTLIGHT.
            The same artwork a second time, at full brightness, masked to a
            soft circle that follows the pointer — so what clears is the part
            under the cursor and nothing else. Cheaper than it looks: the
            browser has the image cached from the layer below, the circle
            moves by two CSS variables, and React never re-renders (see
            use-pointer-spotlight). It fades in and out with the pointer so
            the panel is not left with a bright patch nobody is holding. */}
        {/* Drifting light, always on — the panel is alive before anybody
            touches it. Above the scrim so it lifts the artwork rather than
            sitting under it. */}
        <BrandPanelSmoke />

        {artOk && (
          <img
            src={BRAND_ART}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full scale-105 object-cover object-left opacity-0 transition-opacity duration-500 ease-out group-hover:opacity-100 motion-reduce:transition-none"
            style={{
              WebkitMaskImage: SPOTLIGHT_MASK,
              maskImage: SPOTLIGHT_MASK,
            }}
          />
        )}

        {/* A warm bloom on the same coordinates, so the revealed circle looks
            like light catching the smoke rather than a hole cut in it. Wider
            and much softer than the reveal, which is what stops the mask
            having a visible edge. */}
        <div
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 ease-out group-hover:opacity-100 motion-reduce:transition-none"
          style={{
            background:
              "radial-gradient(circle 340px at var(--spot-x, 50%) var(--spot-y, 50%), hsl(var(--gold) / 0.22) 0%, hsl(var(--gold) / 0.08) 38%, transparent 72%)",
          }}
        />

        <div className="relative z-10">
          <span className="drop-shadow-[0_1px_6px_rgba(0,0,0,0.85)]">
            <BrandMark tone="dark" />
          </span>
        </div>

        <div className="relative z-10 mx-auto max-w-md px-6 text-center">
          <blockquote className="text-[17px] font-medium italic leading-relaxed text-white/85 drop-shadow-[0_1px_8px_rgba(0,0,0,0.6)]">
            “{quote}”
          </blockquote>
          <p className="mt-7 text-[10px] font-semibold uppercase tracking-[0.42em] text-white/45 drop-shadow-[0_1px_6px_rgba(0,0,0,0.85)] transition-colors duration-700 group-hover:text-white/80">
            Process · Systems · People
          </p>
        </div>

        <p className="relative z-10 flex items-center gap-2 text-[11px] text-white/35 drop-shadow-[0_1px_6px_rgba(0,0,0,0.85)] transition-colors duration-700 group-hover:text-white/70">
          <ShieldCheck className="h-3.5 w-3.5" />
          Protected enterprise access
        </p>
      </aside>

      {/* ── The form half ─────────────────────────────────────────────── */}
      <main className="flex min-h-screen flex-col justify-center px-6 py-14 sm:px-10 lg:min-h-0">
        <div className="mx-auto w-full max-w-[380px]">
          <div className="mb-7">
            <BrandMark tone="light" />
          </div>

          {demo ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-xl border border-status-warning/30 bg-status-warning-tint p-4 text-sm">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-status-warning" />
                <div>
                  <p className="font-semibold text-foreground">Backend not configured</p>
                  <p className="mt-1 text-muted-foreground">
                    No Supabase credentials were found, so the platform is running in{" "}
                    <strong>demo mode</strong> over seed data. Nothing is saved. Copy{" "}
                    <code className="rounded bg-muted px-1">.env.example</code> to{" "}
                    <code className="rounded bg-muted px-1">.env.local</code> and restart to
                    enable real sign-in.
                  </p>
                </div>
              </div>
              <Button asChild className="h-11 w-full">
                <Link to="/app">
                  Continue in demo mode <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          ) : (
            <>
              <h1 className="text-[26px] font-bold tracking-tight text-foreground">{heading.title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{heading.blurb}</p>

              <form onSubmit={submit} className="mt-7 space-y-4">
                {panel === "signup" && (
                  <div className="space-y-3">
                    <div>
                      <FieldLabel htmlFor="fullName">Full name</FieldLabel>
                      <Input
                        id="fullName"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        required
                        className={FIELD + " pl-3"}
                      />
                    </div>
                    <div>
                      <FieldLabel htmlFor="businessName">Business / company name</FieldLabel>
                      <Input
                        id="businessName"
                        value={businessName}
                        onChange={(e) => setBusinessName(e.target.value)}
                        required
                        maxLength={80}
                        placeholder="Your company as registered"
                        className={FIELD + " pl-3"}
                      />
                    </div>
                    <div>
                      <FieldLabel htmlFor="phone">Business phone</FieldLabel>
                      <Input
                        id="phone"
                        type="tel"
                        autoComplete="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="(555) 555-0100"
                        className={FIELD + " pl-3"}
                      />
                    </div>
                    <PlanPicker value={plan} onChange={setPlan} />
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      Your organization is created when you confirm your email. A 30-day
                      introductory trial starts then, unless your business already has an
                      organization with BES.
                    </p>
                  </div>
                )}

                <div>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="you@blessedempireservices.com"
                      className={FIELD}
                    />
                  </div>
                </div>

                {wantsPassword && (
                  <div>
                    <FieldLabel
                      htmlFor="password"
                      aside={
                        panel === "password" ? (
                          <button
                            type="button"
                            onClick={() => setPanel("reset")}
                            className="rounded text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                          >
                            Forgot?
                          </button>
                        ) : undefined
                      }
                    >
                      Password
                    </FieldLabel>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete={panel === "signup" ? "new-password" : "current-password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={8}
                        placeholder="Enter your password"
                        className={FIELD + " pr-10"}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        aria-pressed={showPassword}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                )}

                {error && (
                  <p className="rounded-lg border border-status-danger/30 bg-status-danger-tint px-3 py-2 text-sm text-status-danger">
                    {error}
                  </p>
                )}
                {notice && (
                  <p className="rounded-lg border border-status-success/30 bg-status-success-tint px-3 py-2 text-sm text-status-success">
                    {notice}
                  </p>
                )}

                <Button type="submit" disabled={busy} className="h-11 w-full text-[15px] font-semibold">
                  {busy ? "Please wait…" : SUBMIT_LABEL[panel]}
                  {!busy && panel === "password" && <ArrowRight className="ml-2 h-4 w-4" />}
                </Button>
              </form>

              {/* Only rendered when Google is actually configured, so there is
                  never a button here that cannot sign anybody in. */}
              {providers.google && panel !== "signup" && (
                <>
                  <div className="my-6 flex items-center gap-3">
                    <span className="h-px flex-1 bg-border" />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                      or continue with
                    </span>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={google}
                    className="h-11 w-full border-border bg-card text-[15px] font-medium text-foreground hover:bg-muted"
                  >
                    <GoogleMark />
                    Continue with Google
                  </Button>
                </>
              )}

              {/* The other ways in, and sign-up — reachable, not promoted. */}
              <div className="mt-7 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                {panel !== "password" && (
                  <button type="button" onClick={() => setPanel("password")} className="transition-colors hover:text-primary">
                    Use password
                  </button>
                )}
                {panel !== "magic" && (
                  <button type="button" onClick={() => setPanel("magic")} className="transition-colors hover:text-primary">
                    Email me a link
                  </button>
                )}
                {panel !== "signup" && (
                  <button type="button" onClick={() => setPanel("signup")} className="transition-colors hover:text-primary">
                    Create an account
                  </button>
                )}
              </div>
            </>
          )}

          <p className="mt-10 text-center text-[11px] uppercase tracking-[0.1em] text-muted-foreground/70">
            © {new Date().getFullYear()} Blessed Empire Services
          </p>
        </div>
      </main>
    </div>
  );
};

export default Login;
