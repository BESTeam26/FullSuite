import {
  Link2,
  DollarSign,
  Users,
  TrendingUp,
  Copy,
  Download,
  ImageIcon,
  FileText,
  Video,
  Wallet,
  Gift,
  BarChart3,
  Home,
} from "lucide-react";
import { formatDate } from "@/lib/format-date";
import {
  PortalShell,
  type PortalNavItem,
} from "@/components/portals/PortalShell";
import { PermissionScopeCard } from "@/components/portals/PermissionScopeCard";
import { PartnerReferralDashboard } from "@/components/referral/PartnerReferralDashboard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useReferral } from "@/lib/referral/referral-context";
import { useSeo } from "@/lib/use-seo";
import { SampleContentNotice } from "@/components/dashboard/SampleContentNotice";

const nav: PortalNavItem[] = [
  { label: "Overview", href: "/affiliate", icon: Home },
  { label: "DIY Referrals", href: "/affiliate", icon: Users },
  { label: "Commissions", href: "/affiliate", icon: DollarSign },
  { label: "Marketing Assets", href: "/affiliate", icon: ImageIcon },
  { label: "Payouts", href: "/affiliate", icon: Wallet },
];

const assets = [
  { name: "BES Overview Deck", type: "Slide deck", icon: FileText },
  { name: "Social Launch Pack", type: "Image bundle", icon: ImageIcon },
  { name: "60-sec Explainer", type: "Video", icon: Video },
  { name: "Email Swipe Copy", type: "Document", icon: FileText },
];

const payouts = [
  { date: "Aug 1, 2026", amount: "$1,980.40", method: "ACH", status: "Paid" },
  { date: "Jul 1, 2026", amount: "$1,742.10", method: "ACH", status: "Paid" },
  { date: "Jun 1, 2026", amount: "$1,605.00", method: "ACH", status: "Paid" },
];

const AffiliatePortal = () => {
  const { partnerStats, currentPartnerId, peopleForPartner } = useReferral();
  const stats = partnerStats(currentPartnerId);
  const people = peopleForPartner(currentPartnerId);
  useSeo({
    title: "Affiliate Portal — BES",
    description: "Affiliate referral portal.",
    canonical: "/affiliate",
    noindex: true,
  });

  const statCards = [
    {
      label: "Active DIY referrals",
      value: stats.activeDiy,
      icon: Users,
      tone: "text-blue-600",
    },
    {
      label: "Conversion rate",
      value: `${stats.signups ? Math.round((stats.conversions / stats.signups) * 100) : 0}%`,
      icon: TrendingUp,
      tone: "text-emerald-600",
    },
    {
      label: "Pending commission",
      value: `$${stats.pendingCommission.toFixed(2)}`,
      icon: DollarSign,
      tone: "text-amber-600",
    },
    {
      label: "Lifetime earned",
      value: `$${(stats.paidCommission + stats.commissionEarned).toFixed(2)}`,
      icon: Gift,
      tone: "text-emerald-600",
    },
  ];

  return (
    <PortalShell
      title="Partner Portal"
      subtitle="BES DIY Credit referral & lead engine"
      icon={Link2}
      gradientClass="bg-gradient-to-br from-amber-500 to-orange-500"
      nav={nav}
    >
      <SampleContentNotice what="This is a preview of the affiliate portal with example figures; live referral tracking arrives with the referral model." />
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Welcome back, Jordan
          </h1>
          <p className="text-sm text-muted-foreground">
            Refer BES DIY Credit with your tracked link. Referrals auto-create
            attributed leads in your workspace — sensitive credit data stays
            protected by explicit permissions.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-2 pl-4">
          <span className="text-sm text-muted-foreground">
            bes.app/diy?ref=JORDAN
          </span>
          <Button disabled title="Sample content — this action connects when the live data model behind it exists" size="sm" variant="outline">
            <Copy className="h-3.5 w-3.5" /> Copy link
          </Button>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
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

      {/* Full DIY referral dashboard */}
      <PartnerReferralDashboard />

      <div className="mb-8 grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-6 lg:col-span-2">
          <h2 className="flex items-center gap-2 font-semibold">
            <Users className="h-4 w-4 text-emerald-600" /> Recent referrals
          </h2>
          <div className="mt-4 space-y-2">
            {people.slice(0, 4).map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/20 p-3.5"
              >
                <div>
                  <p className="text-sm font-medium">{r.name}</p>
                  <p className="text-xs text-muted-foreground">
                    BES DIY Credit · since {formatDate(r.attribution.firstReferralDate)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge
                    className={
                      r.enrollment.status === "active"
                        ? "bg-emerald-500/10 text-emerald-600"
                        : "bg-amber-500/10 text-amber-600"
                    }
                  >
                    {r.enrollment.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="flex items-center gap-2 font-semibold">
            <Wallet className="h-4 w-4 text-emerald-600" /> Recent payouts
          </h2>
          <div className="mt-4 space-y-2">
            {payouts.map((p) => (
              <div
                key={p.date}
                className="flex items-center justify-between rounded-lg bg-muted/20 p-3 text-sm"
              >
                <div>
                  <p className="font-medium">{p.date}</p>
                  <p className="text-xs text-muted-foreground">{p.method}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{p.amount}</p>
                  <p className="text-[11px] text-emerald-600">{p.status}</p>
                </div>
              </div>
            ))}
          </div>
          <Button disabled title="Sample content — this action connects when the live data model behind it exists" variant="outline" className="mt-4 w-full">
            <BarChart3 className="h-4 w-4" /> View full statement
          </Button>
        </div>
      </div>

      <div className="mb-8 rounded-2xl border border-border bg-card p-6">
        <h2 className="mb-4 flex items-center gap-2 font-semibold">
          <ImageIcon className="h-4 w-4 text-emerald-600" /> Marketing asset
          library
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {assets.map((a) => (
            <div
              key={a.name}
              className="flex items-center justify-between rounded-xl border border-border bg-muted/20 p-3.5"
            >
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-card text-muted-foreground">
                  <a.icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-medium">{a.name}</p>
                  <p className="text-xs text-muted-foreground">{a.type}</p>
                </div>
              </div>
              <Button disabled title="Sample content — this action connects when the live data model behind it exists" size="icon" variant="ghost" className="h-8 w-8">
                <Download className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <PermissionScopeCard role="affiliate" />
    </PortalShell>
  );
};

export default AffiliatePortal;
