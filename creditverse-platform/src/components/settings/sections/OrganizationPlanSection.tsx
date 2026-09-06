/**
 * Organization › Plan & billing — read-only truth about the subscription:
 * plan, trial state, modules enabled, seats in use, and how to reach BES.
 * Payment and plan changes arrive with the Authorize.Net connection; until
 * then the organization contacts BES, and this page says so.
 */
import { CreditCard, Mail } from "lucide-react";
import { SectionCard, StatusBadge } from "@/components/settings/shared";
import { useAgency } from "@/lib/agency-context";
import { useAgencySettings } from "@/lib/agency-settings-context";
import { useOrganizationTrial } from "@/lib/data/use-organization-trial";
import { useTeamMembers } from "@/lib/data/use-team-members";
import { formatDate } from "@/lib/format-date";

export function OrganizationPlanSection() {
  const { activeOrganization: org } = useAgency();
  const { agency } = useAgencySettings();
  const { trial } = useOrganizationTrial(org?.id ?? null);
  const team = useTeamMembers(org?.id ?? null);
  if (!org) return null;
  const enabled = org.entitlements.filter((e) => e.enabled);
  const supportEmail = agency.supportEmail?.trim();
  return (
    <SectionCard icon={CreditCard} title="Plan & billing" description="Your subscription as BES has it on record. Plan changes and payment methods arrive with the payment connection; until then BES handles them for you.">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-background p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Plan</p><p className="mt-1 text-lg font-bold text-foreground">{trial?.planKey ?? "—"}</p><p className="text-[11px] text-muted-foreground">{trial ? "From your sign-up" : "Set by BES"}</p></div>
        <div className="rounded-xl border border-border bg-background p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Status</p><div className="mt-1"><StatusBadge state={trial ? (trial.status === "active" ? "Trial" : trial.status === "converted" ? "Active" : trial.status === "expired" ? "Expired" : "Blocked") : "Active"} /></div>{trial?.status === "active" && <p className="mt-1 text-[11px] text-muted-foreground">Trial until {formatDate(trial.endsAt)}</p>}</div>
        <div className="rounded-xl border border-border bg-background p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Seats in use</p><p className="mt-1 text-lg font-bold text-foreground">{team.members.length}{team.invitations.length > 0 && <span className="text-xs font-normal text-muted-foreground"> + {team.invitations.length} invited</span>}</p></div>
        <div className="rounded-xl border border-border bg-background p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Modules</p><p className="mt-1 text-sm font-semibold text-foreground">{enabled.length === 0 ? "None enabled" : enabled.map((e) => e.label).join(" · ")}</p></div>
      </div>
      <div className="mt-4 rounded-xl border border-border bg-background p-4 text-sm text-foreground">
        <p className="font-semibold">Need a change?</p>
        <p className="mt-1 text-xs text-muted-foreground">Add a module, change your plan or update billing details by contacting BES.{supportEmail ? "" : " BES has not published a support email yet."}</p>
        {supportEmail && <a href={`mailto:${supportEmail}?subject=${encodeURIComponent(`Plan change request · ${org.name} (${org.publicId})`)}`} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><Mail className="h-3.5 w-3.5" /> Email BES</a>}
      </div>
    </SectionCard>
  );
}
