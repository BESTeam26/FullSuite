import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { ShieldCheck, Mail, Lock, ArrowRight, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth/auth-context";
import { useSeo } from "@/lib/use-seo";

type Panel = "password" | "magic" | "signup" | "reset";

const Login = () => {
  const auth = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/app";

  const [panel, setPanel] = useState<Panel>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useSeo({
    title: "Sign in — BES",
    description: "Sign in to the BES operations platform.",
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
        result = await auth.signUp(email, password, fullName);
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

  return (
    <div className="flex min-h-screen bg-gradient-charcoal text-white">
      <div className="mx-auto flex w-full max-w-md flex-col justify-center px-6 py-12">
        <Link to="/" className="mb-8 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-gold text-charcoal">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <span className="text-lg font-bold">BES</span>
          <span className="text-sm text-white/50">Operations Platform</span>
        </Link>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          {demo ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                <div>
                  <p className="font-semibold text-amber-200">Backend not configured</p>
                  <p className="mt-1 text-white/70">
                    No Supabase credentials were found, so the platform is running
                    in <strong>demo mode</strong> over seed data. Nothing is saved.
                    Copy <code className="rounded bg-white/10 px-1">.env.example</code> to{" "}
                    <code className="rounded bg-white/10 px-1">.env.local</code> and
                    restart to enable real sign-in.
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
            <form onSubmit={submit} className="space-y-4">
              <div>
                <h1 className="text-xl font-bold">
                  {panel === "signup"
                    ? "Create your account"
                    : panel === "reset"
                      ? "Reset your password"
                      : "Sign in"}
                </h1>
                <p className="mt-1 text-sm text-white/60">
                  {panel === "magic"
                    ? "We'll email you a one-time sign-in link."
                    : "Access is granted by your agency or organization administrator."}
                </p>
              </div>

              {panel === "signup" && (
                <div className="space-y-1.5">
                  <Label htmlFor="fullName" className="text-white/80">Full name</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    className="border-white/10 bg-white/5 text-white placeholder:text-white/30"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-white/80">Email</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="border-white/10 bg-white/5 pl-9 text-white placeholder:text-white/30"
                  />
                </div>
              </div>

              {(panel === "password" || panel === "signup") && (
                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-white/80">Password</Label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                    <Input
                      id="password"
                      type="password"
                      autoComplete={panel === "signup" ? "new-password" : "current-password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={8}
                      className="border-white/10 bg-white/5 pl-9 text-white placeholder:text-white/30"
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
                className="w-full bg-gradient-gold text-charcoal hover:opacity-90"
              >
                {busy
                  ? "Please wait…"
                  : panel === "password"
                    ? "Sign in"
                    : panel === "magic"
                      ? "Send sign-in link"
                      : panel === "signup"
                        ? "Create account"
                        : "Send reset email"}
              </Button>

              <div className="flex flex-wrap justify-between gap-2 pt-1 text-xs text-white/60">
                {panel !== "password" && (
                  <button type="button" onClick={() => setPanel("password")} className="hover:text-white">
                    Use password
                  </button>
                )}
                {panel !== "magic" && (
                  <button type="button" onClick={() => setPanel("magic")} className="hover:text-white">
                    Email me a link
                  </button>
                )}
                {panel !== "reset" && panel !== "signup" && (
                  <button type="button" onClick={() => setPanel("reset")} className="hover:text-white">
                    Forgot password
                  </button>
                )}
                {panel !== "signup" && (
                  <button type="button" onClick={() => setPanel("signup")} className="hover:text-white">
                    Create account
                  </button>
                )}
              </div>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-white/40">
          <Link to="/" className="hover:text-white/70">← Back to site</Link>
        </p>
      </div>
    </div>
  );
};

export default Login;
