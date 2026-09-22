/**
 * What BES is actually doing for this customer.
 *
 * Dee, 2026-09-22: *"visually, I would use a very simple badge: ● Active
 * Fulfillment. Then beside or underneath it, show exactly what BES is
 * fulfilling: CreditOps · BES CRM · TalentOps · FundingOps. That gives you the
 * identifier you're looking for without creating another status people have to
 * manually maintain."*
 *
 * It is not a status anybody sets. `besServices` is derived from live
 * `fulfillment_engagements` every time it is read, so ending the last
 * engagement changes this badge with no second step and nothing to forget.
 *
 * For a BES reader the "no active fulfillment" state is mostly unreachable —
 * such an organization is not in their directory at all. It still renders,
 * because an organization's OWN members see their tenancy whether or not BES
 * is engaged, and telling them plainly is better than a blank.
 */
import { orgDivisionLabel } from "@/lib/agency/division-label";
import { cn } from "@/lib/utils";

export function BesFulfillmentBadge({ services, className }: {
  services: readonly string[] | undefined;
  className?: string;
}) {
  const active = (services ?? []).length > 0;
  const named = (services ?? [])
    .map((s) => orgDivisionLabel(s) ?? s)
    .join(" · ");

  return (
    <span className={cn("inline-flex flex-col gap-0.5", className)}>
      <span className={cn(
        "inline-flex items-center gap-1.5 text-[11px] font-semibold",
        active ? "text-status-success" : "text-muted-foreground",
      )}>
        <span aria-hidden className={cn(
          "h-1.5 w-1.5 rounded-full",
          active ? "bg-status-success" : "bg-muted-foreground/40",
        )} />
        {active ? "Active Fulfillment" : "No Active Fulfillment"}
      </span>
      {active && (
        <span className="truncate text-[11px] text-muted-foreground">{named}</span>
      )}
    </span>
  );
}
