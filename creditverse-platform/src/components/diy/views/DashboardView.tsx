import {
  ScanSearch,
  Scale,
  ShieldCheck,
  GraduationCap,
  Banknote,
  HandHelping,
  ArrowRight,
  Link2,
} from "lucide-react";
import { useDiy } from "@/lib/diy/diy-context";
import { StatCard, ItemRow } from "./shared";
import { useReferral } from "@/lib/referral/referral-context";
import { useState } from "react";

export const DashboardView = () => {
  const { items, setView, imported } = useDiy();
  const { requestProfessionalHelp, requestFundingReview } = useReferral();
  const [requested, setRequested] = useState<string | null>(null);

  const negatives = items.filter((i) => i.isNegative);
  const disputeReady = items.filter((i) => i.disposition === "dispute");
  const positives = items.filter((i) => !i.isNegative);
  const needsReview = items.filter((i) => i.disposition === "never");

  // Simulated current consumer id (in production this is the signed-in user)
  const consumerId = "c-2";

  const handleProfessional = () => {
    requestProfessionalHelp(consumerId);
    setRequested("professional");
  };
  const handleFunding = () => {
    requestFundingReview(consumerId);
    setRequested("funding");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Good morning, John
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your credit accuracy review. You own the facts — nothing is sent
          without your approval.
        </p>
      </div>

      {/* Referral attribution banner */}
      <div className="flex items-center gap-3 rounded-xl border border-amber-400/30 bg-amber-500/5 p-3.5">
        <Link2 className="h-4 w-4 shrink-0 text-amber-300" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          You joined BES DIY Credit through a partner referral. Your progress
          may be visible to your referring partner for service continuity.
          Sensitive credit data stays protected by explicit permissions.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Items need review"
          value={negatives.length}
          tone="text-amber-300"
          icon={ScanSearch}
        />
        <StatCard
          label="Ready to dispute"
          value={disputeReady.length}
          tone="text-emerald-300"
          icon={Scale}
        />
        <StatCard
          label="Open positive"
          value={
            positives.filter((p) => p.disposition === "open-positive").length
          }
          tone="text-sky-300"
          icon={ShieldCheck}
        />
        <StatCard
          label="Protected (never)"
          value={needsReview.length}
          tone="text-slate-300"
          icon={ShieldCheck}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Items that need you</h2>
            <button
              onClick={() => setView("disputes")}
              className="text-xs font-semibold text-amber-300 hover:text-amber-200"
            >
              View all
            </button>
          </div>
          <div className="space-y-2">
            {negatives.slice(0, 3).map((it) => (
              <ItemRow key={it.id} item={it} />
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/5 p-4">
            <ShieldCheck className="h-5 w-5 text-emerald-300" />
            <p className="mt-2 text-sm font-semibold text-emerald-200">
              You're in control
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              No dispute is sent on your behalf without your review and
              approval. You state the facts and sign off.
            </p>
          </div>

          {/* Contextual CTAs — lead-gen bridge */}
          <div className="space-y-3">
            <button
              onClick={handleProfessional}
              disabled={requested === "professional"}
              className="flex w-full items-start gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-amber-400/40 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-300">
                <HandHelping className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-foreground">
                  {requested === "professional"
                    ? "Request sent"
                    : "Want professional credit help?"}
                </span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
                  {requested === "professional"
                    ? "Your referring partner has been notified."
                    : "Request Done-For-You help. Routed to your referring partner if eligible."}
                </span>
              </span>
            </button>

            <button
              onClick={handleFunding}
              disabled={requested === "funding"}
              className="flex w-full items-start gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-emerald-400/40 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-300">
                <Banknote className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-foreground">
                  {requested === "funding"
                    ? "Request sent"
                    : "Looking for business funding?"}
                </span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
                  {requested === "funding"
                    ? "Your referring partner has been notified."
                    : "Request a funding readiness review. Routed to your referring partner if eligible."}
                </span>
              </span>
            </button>
          </div>

          {!imported && (
            <button
              onClick={() => setView("import")}
              className="w-full rounded-xl bg-gradient-gold px-4 py-3 text-sm font-semibold text-charcoal hover:opacity-90"
            >
              Import your report to start
            </button>
          )}
          <button
            onClick={() => setView("learn")}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold text-slate-200 hover:bg-muted"
          >
            <GraduationCap className="h-4 w-4" /> Learn how this works{" "}
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
};
