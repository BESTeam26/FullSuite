/**
 * Start a trial.
 *
 * Plans, prices and trial lengths come from the `plans` table — nothing on
 * this page is written into the markup. The account is created through
 * Supabase Auth; the organization, its entitlements and the trial are created
 * by the database when the email is confirmed, which is also where a
 * duplicate business is caught.
 */
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, Loader2, Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchPublicPlans, signUpForTrial, signUpProblem, type PublicPlan } from "@/lib/data/signup";
import { PRODUCT_LABELS, type ProductKey } from "@/lib/bes-domain";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/data/error-message";
import { cn } from "@/lib/utils";

const inputCls = "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary";
const labelCls = "block text-[11px] font-bold uppercase tracking-wider text-muted-foreground";

const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);

export default function SignUp() {
  const navigate = useNavigate();
  const plansQuery = useQuery({ queryKey: ["public-plans"], queryFn: fetchPublicPlans, enabled: isSupabaseConfigured, staleTime: 5 * 60_000 });
  const plans = useMemo(() => plansQuery.data ?? [], [plansQuery.data]);

  const [planKey, setPlanKey] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<ProductKey | "">("");
  const [fullName, setFullName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  /* The recommended plan is chosen for them, and it comes from the row. */
  const chosen = plans.find((p) => p.key === planKey) ?? plans.find((p) => p.recommended);
  const effectiveKey = planKey || chosen?.key || "";
  const choices: ProductKey[] = chosen?.chooseOne ? chosen.products.filter((p) => p === "creditOps" || p === "fundingOps") : [];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input = {
      email, password, fullName, businessName, phone,
      planKey: effectiveKey,
      selectedProduct: selectedProduct || undefined,
    };
    const bad = signUpProblem(input, chosen);
    if (bad) { setProblem(bad); return; }
    setProblem(null);
    setBusy(true);
    try {
      const result = await signUpForTrial(input);
      if (result.status === "error") setProblem(result.message);
      else if (result.status === "signed_in") navigate("/app");
      else setSent(result.email);
    } catch (err) {
      setProblem(errorMessage(err, "The account could not be created."));
    } finally {
      setBusy(false);
    }
  };

  if (!isSupabaseConfigured) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6 text-center">
        <h1 className="text-xl font-bold text-foreground">Sign-up is not available here</h1>
        <p className="mt-2 text-sm text-muted-foreground">This copy of the app has no backend configured.</p>
      </main>
    );
  }

  if (sent) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
        <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <Mail className="mx-auto h-8 w-8 text-primary" />
          <h1 className="mt-3 text-xl font-bold text-foreground">Confirm your email</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We sent a link to <span className="font-semibold text-foreground">{sent}</span>. Opening it creates your
            workspace and starts your trial.
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Nothing is charged, and no card is asked for. If the email does not arrive, check the spam folder or
            <Link to="/login" className="ml-1 font-semibold text-primary hover:underline">sign in</Link> once it does.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl p-6 md:p-10">
      <header className="mb-8 text-center">
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">Start your trial</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your own workspace, your team, and the work — credit repair, funding, or both.
        </p>
      </header>

      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <section aria-label="Choose a plan">
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Choose a plan</h2>
          {plansQuery.isLoading ? (
            <div className="space-y-2" aria-busy="true">
              {[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl border border-border bg-card" />)}
            </div>
          ) : plansQuery.error ? (
            <p role="alert" className="text-sm text-status-danger">The plans could not be loaded. Please try again shortly.</p>
          ) : (
            <ul className="space-y-2">
              {plans.map((p) => {
                const active = p.key === effectiveKey;
                return (
                  <li key={p.key}>
                    <button
                      type="button"
                      onClick={() => { setPlanKey(p.key); setSelectedProduct(""); }}
                      aria-pressed={active}
                      className={cn(
                        "w-full rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                        active ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40",
                      )}
                    >
                      <span className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="flex items-center gap-2 text-sm font-bold text-foreground">
                          {p.label}
                          {p.recommended && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">Recommended</span>}
                          {active && <Check className="h-4 w-4 text-primary" />}
                        </span>
                        <span className="text-sm font-bold text-foreground">
                          {p.monthlyCents > 0 ? <>{money(p.monthlyCents)}<span className="text-xs font-normal text-muted-foreground">/month</span></> : "Priced on request"}
                        </span>
                      </span>
                      {p.tagline && <span className="mt-0.5 block text-xs text-muted-foreground">{p.tagline}</span>}
                      <span className="mt-1 block text-[11px] text-muted-foreground">
                        {p.products.map((k) => PRODUCT_LABELS[k] ?? k).join(" · ")}
                        {p.seatsIncluded ? ` · ${p.seatsIncluded} seats included` : ""}
                      </span>
                      <span className="mt-1 block text-[11px] font-semibold text-status-success">
                        {p.publicTrial ? `${p.trialDays}-day trial, no card` : "Arranged with the BES team"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {choices.length > 0 && (
            <fieldset className="mt-3 rounded-xl border border-border bg-card p-4">
              <legend className={labelCls}>{chosen?.label} includes one — choose it</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {choices.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setSelectedProduct(k)}
                    aria-pressed={selectedProduct === k}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      selectedProduct === k ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground hover:bg-muted",
                    )}
                  >
                    {PRODUCT_LABELS[k] ?? k}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">You can add the other one later without losing anything.</p>
            </fieldset>
          )}
        </section>

        <section aria-label="Your details" className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Your details</h2>
          <div className="space-y-3">
            <label className="block text-sm"><span className={labelCls}>Your name</span>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} autoComplete="name" required />
            </label>
            <label className="block text-sm"><span className={labelCls}>Business name</span>
              <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} className={inputCls} autoComplete="organization" required />
              <span className="mt-1 block text-[11px] text-muted-foreground">This becomes your organization's name; you can change it later.</span>
            </label>
            <label className="block text-sm"><span className={labelCls}>Work email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} autoComplete="email" required />
            </label>
            <label className="block text-sm"><span className={labelCls}>Phone</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} autoComplete="tel" inputMode="tel" />
            </label>
            <label className="block text-sm"><span className={labelCls}>Password</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} autoComplete="new-password" minLength={8} required />
              <span className="mt-1 block text-[11px] text-muted-foreground">At least 8 characters.</span>
            </label>
          </div>

          {problem && <p role="alert" className="mt-3 text-xs text-status-danger">{problem}</p>}

          <Button type="submit" className="mt-4 w-full" disabled={busy}>
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Start {chosen?.trialDays ?? 30}-day trial <ArrowRight className="ml-1 h-4 w-4" />
          </Button>

          <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            No card is asked for. A business already on record with BES is reviewed before a trial starts, and you are
            told either way.
          </p>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Already have an account? <Link to="/login" className="font-semibold text-primary hover:underline">Sign in</Link>
          </p>
        </section>
      </form>
    </main>
  );
}
