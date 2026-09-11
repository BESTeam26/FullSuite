/**
 * BES HQ home.
 *
 * Every figure here is counted in the database. The panels this replaced —
 * platform health, revenue mix, DIY statistics, fulfillment health and "HQ
 * updates" — were hard-coded: "Apex Credit Co. · 127 clients", "$8,495",
 * "418 active consumers", "99.9% uptime", "286 dispute letters processed".
 * None of it came from anywhere, so none of it is here.
 *
 * What is left is real: counts from `useAgencyOverview`, the live attention
 * queue, the organizations BES actually has, metered invoicing, and the
 * announcements BES has actually published.
 */
import { Building2, Briefcase, Landmark, Receipt, Sparkles, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Crown } from "lucide-react";
import { useAgency } from "@/lib/agency-context";
import { useAttention } from "@/lib/data/use-work";
import { useAuth } from "@/lib/auth/auth-context";
import { useCopilot } from "@/lib/copilot-context";
import { useOwnProfile } from "@/lib/data/use-account";
import { useAgencyOverview } from "@/lib/data/use-agency-overview";
import { dayGreeting } from "@/lib/greetings/day-greeting";
import { MemberFirstRunCard } from "@/components/dashboard/GettingStartedCard";
import { AgencyBirthdayStrip } from "@/components/dashboard/AgencyBirthdayStrip";
import { AttentionCenter } from "./agency/AttentionCenter";
import { SubAccountMiniGrid } from "./agency/SubAccountMiniGrid";
import { SubAccountInvoicingMetering } from "./SubAccountInvoicingMetering";
import { AnnouncementsBoard } from "@/components/intranet/AnnouncementsBoard";
import { KpiTile } from "@/components/dashboard/ops/KpiTile";

export const AgencyDashboard = () => {
  const auth = useAuth();
  const account = useOwnProfile();
  const attention = useAttention();
  const overview = useAgencyOverview();
  const { subAccounts, switchToSubAccount } = useAgency();
  const navigate = useNavigate();
  const copilot = useCopilot();

  const figures = overview.data;
  const value = (n: number | undefined) => (overview.isLoading ? "…" : (n ?? 0));

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-6 md:p-8">
      <AgencyBirthdayStrip />
      <MemberFirstRunCard />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Badge className="border border-amber-500/30 bg-amber-500/10 font-semibold text-status-warning">
              <Crown className="mr-1 h-3 w-3" /> BES HQ
            </Badge>
          </div>
          <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">
            {dayGreeting(new Date(), account.profile?.preferredName, account.profile?.fullName ?? auth.displayName)}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {overview.isLoading
              ? "Counting…"
              : `${figures?.organizations ?? 0} organization${figures?.organizations === 1 ? "" : "s"} · ${figures?.liveEngagements ?? 0} live fulfillment engagement${figures?.liveEngagements === 1 ? "" : "s"}.`}
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={() => navigate("/app/subaccounts")}
            className="bg-amber-500 font-bold text-charcoal shadow-sm hover:bg-amber-600"
          >
            <Building2 className="mr-1.5 h-4 w-4" /> Add Organization
          </Button>
          <Button
            variant="outline"
            onClick={() => copilot.setOpen(true)}
            className="border-emerald-500/30 font-semibold text-status-success hover:bg-emerald-500/10"
          >
            <Sparkles className="mr-1.5 h-4 w-4" /> Ask Lina
          </Button>
        </div>
      </div>

      {/* Counted in the database, bounded by what this user may see. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiTile label="Organizations" value={value(figures?.organizations)} icon={Building2} tone="blue" />
        <KpiTile label="Credit clients" value={value(figures?.creditClients)} icon={Users} tone="emerald" />
        <KpiTile label="Funding files" value={value(figures?.fundingFiles)} icon={Landmark} tone="purple" />
        <KpiTile label="Funded" value={value(figures?.fundedFiles)} icon={Briefcase} tone="green" />
        <KpiTile
          label="Needs attention"
          value={attention.items.length}
          icon={Receipt}
          tone="amber"
          attention={attention.items.length > 0}
        />
      </div>
      {overview.error && (
        <p role="alert" className="text-xs text-status-danger">Some figures could not be counted just now.</p>
      )}

      <AttentionCenter />

      <SubAccountMiniGrid subAccounts={subAccounts} onSwitch={switchToSubAccount} />

      <div>
        <div className="mb-3 flex items-center gap-2">
          <Receipt className="h-4 w-4 text-status-warning" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Organization Invoicing &amp; Usage Metering
          </h2>
        </div>
        <SubAccountInvoicingMetering />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">Announcements</h2>
        <AnnouncementsBoard
          organizationId={null}
          canWrite={auth.isAgencyStaff}
          audienceChoices={[
            { value: "all_organizations", label: "Every organization" },
            { value: "bes_internal", label: "BES internal only" },
          ]}
        />
      </div>
    </div>
  );
};
