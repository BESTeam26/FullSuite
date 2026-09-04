import {
  ScanSearch,
  FileCheck2,
  TrendingUp,
  HandHelping,
  Banknote,
  ArrowRight,
  AlertCircle,
  Clock,
  GraduationCap,
} from "lucide-react";
import { useDiyManagement } from "@/lib/diy/diy-management-context";
import { useReferral } from "@/lib/referral/referral-context";
import { useState } from "react";
import { JOURNEY_STEPS } from "@/lib/diy/diy-domain";

const StatCard = ({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  tone: string;
  icon: typeof ScanSearch;
}) => (
  <div className="rounded-xl border border-border bg-card p-4">
    <Icon className="h-4 w-4 text-muted-foreground" />
    <p className={`mt-2 text-2xl font-bold ${tone}`}>{value}</p>
    <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
  </div>
);

export const ConsumerHome = () => {
  const { people, whiteLabel } = useDiyManagement();
  const { requestProfessionalHelp, requestFundingReview } = useReferral();
  const [requested, setRequested] = useState<string | null>(null);

  // Simulated current consumer — Maria Torres (per-1)
  const me = people.find((p) => p.id === "per-1");
  const journeyIdx = me?.diy
    ? JOURNEY_STEPS.findIndex((s) => s.key === me.diy!.journeyStep)
    : 0;

  const handleProfessional = () => {
    requestProfessionalHelp("c-2");
    setRequested("professional");
  };
  const handleFunding = () => {
    requestFundingReview("c-2");
    setRequested("funding");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Good morning, {me?.name.split(" ")[0] || "there"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{whiteLabel.welcomeCopy}</p>
      </div>

      {/* Scores */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Equifax", score: 612, prev: 588 },
          { label: "Experian", score: 598, prev: 572 },
          { label: "TransUnion", score: 605, prev: 590 },
        ].map((b) => (
          <div
            key={b.label}
            className="rounded-2xl border border-border bg-card p-4 text-center"
          >
            <p className="text-xs text-muted-foreground">{b.label}</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{b.score}</p>
            <p className="text-xs font-semibold text-emerald-300">
              +{b.score - b.prev}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Accounts need review"
          value={2}
          tone="text-amber-300"
          icon={ScanSearch}
        />
        <StatCard
          label="Inquiries need confirmation"
          value={1}
          tone="text-amber-300"
          icon={FileCheck2}
        />
        <StatCard
          label="Documents requested"
          value={3}
          tone="text-sky-300"
          icon={FileCheck2}
        />
        <StatCard
          label="Items resolved"
          value={4}
          tone="text-emerald-300"
          icon={TrendingUp}
        />
      </div>

      {/* Journey progress tracker */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Your journey</h2>
          <span className="text-xs text-muted-foreground">
            Step {journeyIdx + 1} of {JOURNEY_STEPS.length}
          </span>
        </div>
        <div className="flex gap-1 overflow-x-auto pb-2">
          {JOURNEY_STEPS.map((s, i) => (
            <div
              key={s.key}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-medium ${
                i < journeyIdx
                  ? "bg-emerald-500/15 text-emerald-300"
                  : i === journeyIdx
                    ? "bg-gradient-gold text-charcoal"
                    : "bg-card text-muted-foreground"
              }`}
            >
              {i < journeyIdx && "✓ "}
              {s.label}
            </div>
          ))}
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-gradient-gold"
            style={{ width: `${me?.diy?.progressPct || 5}%` }}
          />
        </div>
      </div>

      {/* Next actions */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold">Next actions</h2>
        <div className="space-y-2">
          {[
            {
              icon: AlertCircle,
              text: "2 accounts need your review — confirm whether the reported information is accurate.",
              tone: "text-amber-300",
            },
            {
              icon: FileCheck2,
              text: "1 inquiry needs confirmation — did you authorize it?",
              tone: "text-amber-300",
            },
            {
              icon: Clock,
              text: "3 documents requested to support your disputes.",
              tone: "text-sky-300",
            },
          ].map((a, i) => (
            <div
              key={i}
              className="flex items-start gap-3 rounded-lg bg-navy-deep/60 p-3"
            >
              <a.icon className={`mt-0.5 h-4 w-4 shrink-0 ${a.tone}`} />
              <p className="text-xs leading-relaxed text-muted-foreground">{a.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Contextual CTAs — lead-gen bridge */}
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          onClick={handleProfessional}
          disabled={requested === "professional"}
          className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-amber-400/40 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
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
                ? "Your organization has been notified."
                : "Request Done-For-You help from your organization."}
            </span>
          </span>
        </button>

        <button
          onClick={handleFunding}
          disabled={requested === "funding"}
          className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-emerald-400/40 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
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
                ? "Your organization has been notified."
                : "Request a funding readiness review."}
            </span>
          </span>
        </button>
      </div>

      <button className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold text-slate-200 hover:bg-muted">
        <GraduationCap className="h-4 w-4" /> Learn how this works{" "}
        <ArrowRight className="h-3 w-3" />
      </button>
    </div>
  );
};
