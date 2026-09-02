import {
  Link2,
  MousePointerClick,
  UserPlus,
  CreditCard,
  Activity,
  HandHelping,
  Banknote,
  ArrowRightLeft,
  DollarSign,
  Clock,
  CheckCircle2,
  Copy,
} from "lucide-react";
import { useReferral } from "@/lib/referral/referral-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type {
  Person,
  LeadOpportunity,
  CommissionRecord,
} from "@/lib/referral/referral-types";

const diyStatusTone: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-600",
  trial: "bg-amber-500/10 text-amber-600",
  paused: "bg-slate-500/10 text-slate-600",
  canceled: "bg-red-500/10 text-red-600",
  churned: "bg-red-500/10 text-red-600",
};

const convStatus = (p: Person): string => {
  if (p.professionalHelpInterest && p.fundingInterest)
    return "Credit + Funding";
  if (p.professionalHelpInterest) return "Professional Credit";
  if (p.fundingInterest) return "Funding";
  if (p.subscription.status === "active" && p.subscription.amount > 0)
    return "Paying DIY";
  if (p.subscription.status === "trialing") return "Trial";
  return "Signup";
};

const interestLabel = (p: Person): string => {
  if (p.professionalHelpInterest && p.fundingInterest) return "Both";
  if (p.professionalHelpInterest) return "Professional Credit";
  if (p.fundingInterest) return "Business Funding";
  return "—";
};

const commissionTone: Record<string, string> = {
  pending: "bg-slate-500/10 text-slate-600",
  eligible: "bg-amber-500/10 text-amber-600",
  approved: "bg-sky-500/10 text-sky-600",
  paid: "bg-emerald-500/10 text-emerald-600",
  reversed: "bg-red-500/10 text-red-600",
};

const leadTypeLabel: Record<string, string> = {
  diy_signup: "DIY Signup",
  professional_help_request: "Professional Help Request",
  funding_request: "Funding Request",
  funding_readiness_reassessment: "Funding Reassessment",
};

export const PartnerReferralDashboard = () => {
  const {
    currentPartnerId,
    partners,
    setCurrentPartnerId,
    peopleForPartner,
    leadsForPartner,
    commissionsForPartner,
    partnerStats,
  } = useReferral();

  const partner = partners.find((p) => p.id === currentPartnerId)!;
  const stats = partnerStats(currentPartnerId);
  const people = peopleForPartner(currentPartnerId);
  const leads = leadsForPartner(currentPartnerId);
  const commissions = commissionsForPartner(currentPartnerId);

  const statCards = [
    {
      label: "Link clicks",
      value: stats.clicks,
      icon: MousePointerClick,
      tone: "text-slate-600",
    },
    {
      label: "Signups",
      value: stats.signups,
      icon: UserPlus,
      tone: "text-blue-600",
    },
    {
      label: "Paying consumers",
      value: stats.payingConsumers,
      icon: CreditCard,
      tone: "text-emerald-600",
    },
    {
      label: "Active DIY",
      value: stats.activeDiy,
      icon: Activity,
      tone: "text-emerald-600",
    },
    {
      label: "Professional help requests",
      value: stats.professionalHelpRequests,
      icon: HandHelping,
      tone: "text-amber-600",
    },
    {
      label: "Funding requests",
      value: stats.fundingRequests,
      icon: Banknote,
      tone: "text-amber-600",
    },
    {
      label: "Conversions",
      value: stats.conversions,
      icon: ArrowRightLeft,
      tone: "text-emerald-600",
    },
    {
      label: "Commission earned",
      value: `$${stats.commissionEarned.toFixed(2)}`,
      icon: DollarSign,
      tone: "text-emerald-600",
    },
    {
      label: "Pending commission",
      value: `$${stats.pendingCommission.toFixed(2)}`,
      icon: Clock,
      tone: "text-amber-600",
    },
    {
      label: "Paid commission",
      value: `$${stats.paidCommission.toFixed(2)}`,
      icon: CheckCircle2,
      tone: "text-emerald-600",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Partner switcher + referral link */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            BES DIY Referrals
          </h1>
          <p className="text-sm text-muted-foreground">
            Consumers who joined BES DIY Credit through your tracked link.
            Attribution is preserved even if they later add professional credit
            or funding.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-2 pl-4">
          <span className="text-sm text-muted-foreground">
            {partner.referralLink}
          </span>
          <Button size="sm" variant="outline">
            <Copy className="h-3.5 w-3.5" /> Copy link
          </Button>
        </div>
      </div>

      {/* Partner selector */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Viewing as:
        </span>
        {partners
          .filter((p) => p.id !== "bes-direct")
          .map((p) => (
            <button
              key={p.id}
              onClick={() => setCurrentPartnerId(p.id)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                p.id === currentPartnerId
                  ? "border-amber-500/50 bg-amber-500/10 text-amber-700"
                  : "border-border bg-card text-muted-foreground hover:bg-muted"
              }`}
            >
              {p.name}
            </button>
          ))}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {statCards.map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-border bg-card p-4"
          >
            <s.icon className={`h-4 w-4 ${s.tone}`} />
            <p className="mt-2 text-2xl font-bold">{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Referral list */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold">
            <Link2 className="h-4 w-4 text-amber-600" /> Your DIY referrals
          </h2>
          <Badge className="bg-muted text-muted-foreground">
            {people.length} attributed
          </Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Source: BES DIY Credit. Partner B can never see Partner A's referrals.
          Original attribution is preserved across services.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="pb-2 pr-4 font-medium">Consumer</th>
                <th className="pb-2 pr-4 font-medium">Source</th>
                <th className="pb-2 pr-4 font-medium">DIY Status</th>
                <th className="pb-2 pr-4 font-medium">Referral Date</th>
                <th className="pb-2 pr-4 font-medium">Conversion</th>
                <th className="pb-2 pr-4 font-medium">Service Interest</th>
                <th className="pb-2 pr-4 font-medium">Commission</th>
                <th className="pb-2 font-medium">Next Action</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => {
                const cm = commissions.find((c) => c.personId === p.id);
                return (
                  <tr
                    key={p.id}
                    className="border-b border-border/60 last:border-0"
                  >
                    <td className="py-3 pr-4">
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.email}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <Badge className="bg-amber-500/10 text-amber-700">
                        BES DIY Credit
                      </Badge>
                    </td>
                    <td className="py-3 pr-4">
                      <Badge
                        className={
                          diyStatusTone[p.enrollment.status] ??
                          "bg-muted text-muted-foreground"
                        }
                      >
                        {p.enrollment.status}
                      </Badge>
                    </td>
                    <td className="py-3 pr-4 text-xs text-muted-foreground">
                      {p.attribution.firstReferralDate}
                    </td>
                    <td className="py-3 pr-4 text-xs">{convStatus(p)}</td>
                    <td className="py-3 pr-4 text-xs">{interestLabel(p)}</td>
                    <td className="py-3 pr-4">
                      {cm ? (
                        <Badge
                          className={
                            commissionTone[cm.state] ??
                            "bg-muted text-muted-foreground"
                          }
                        >
                          {cm.state} · ${cm.amount.toFixed(2)}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-3 text-xs">
                      {p.professionalHelpInterest ? (
                        <span className="text-amber-600">
                          Contact re: credit
                        </span>
                      ) : p.fundingInterest ? (
                        <span className="text-amber-600">
                          Contact re: funding
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Monitor</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {people.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    No attributed DIY referrals yet. Share your tracked link to
                    start.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Leads + commissions */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="flex items-center gap-2 font-semibold">
            <HandHelping className="h-4 w-4 text-amber-600" /> Routed
            opportunities
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Lead-gen requests from your DIY referrals, routed back to you.
          </p>
          <div className="mt-4 space-y-2">
            {leads.map((l: LeadOpportunity) => {
              const person = people.find((p) => p.id === l.personId);
              return (
                <div
                  key={l.id}
                  className="rounded-xl border border-border bg-muted/20 p-3.5"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      {person?.name ?? "Unknown"}
                    </p>
                    <Badge className="bg-amber-500/10 text-amber-700">
                      {leadTypeLabel[l.type] ?? l.type}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{l.note}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {l.createdDate} · stage: {l.stage}
                  </p>
                </div>
              );
            })}
            {leads.length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">
                No routed opportunities yet.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="flex items-center gap-2 font-semibold">
            <DollarSign className="h-4 w-4 text-emerald-600" /> Commission
            ledger
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Commission, referral attribution, and service conversion are kept as
            separate records.
          </p>
          <div className="mt-4 space-y-2">
            {commissions.map((c: CommissionRecord) => {
              const person = people.find((p) => p.id === c.personId);
              return (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-xl border border-border bg-muted/20 p-3.5"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {person?.name ?? "Unknown"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.createdDate}
                      {c.paidDate ? ` · paid ${c.paidDate}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">
                      ${c.amount.toFixed(2)}
                    </span>
                    <Badge
                      className={
                        commissionTone[c.state] ??
                        "bg-muted text-muted-foreground"
                      }
                    >
                      {c.state}
                    </Badge>
                  </div>
                </div>
              );
            })}
            {commissions.length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">
                No commission records yet.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
