/**
 * The channels a dispute round MAY involve, and what each one actually is.
 *
 * This replaces the TRAP Strategy panel (CR-4b). That panel presented CRA +
 * FTC + CFPB as "multi-channel pressure from Round 1", with "every channel
 * fires simultaneously to establish the compliance record", and counted FTC
 * filings and CFPB complaints from account categories alone.
 *
 * A dispute round is allowed to be just:
 *
 *     fact → recipient → dispute → result
 *
 * So this is context, not a checklist. The bureau letter is the round. The
 * other two are things the CONSUMER may choose to do, shown here so an
 * operator can explain them — never counted as work BES has assigned.
 */
import { Building2, ShieldAlert, Scale, Info } from "lucide-react";
import { DISPUTE_CHANNELS } from "@/lib/dispute/letters-and-channels";
import type { DisputePackage } from "@/lib/dispute/package-builder";

const iconMap = { Building2, ShieldAlert, Scale } as const;

export const DisputeChannelsPanel = ({ pkg }: { pkg: DisputePackage }) => {
  const channels = [
    {
      key: "CRA" as const,
      ...DISPUTE_CHANNELS.CRA,
      count: `${pkg.totalItems}`,
      detail: `${pkg.mailPieces} mail piece${pkg.mailPieces === 1 ? "" : "s"} across ${pkg.totalLetters} letter${pkg.totalLetters === 1 ? "" : "s"}`,
    },
    {
      key: "FTC" as const,
      ...DISPUTE_CHANNELS.FTC,
      count: `${pkg.ftcFilings}`,
      detail:
        pkg.ftcFilings > 0
          ? `${pkg.ftcFilings} item${pkg.ftcFilings === 1 ? "" : "s"} where the consumer reported identity theft`
          : "No item on this round has a recorded identity-theft report",
    },
    {
      key: "CFPB" as const,
      ...DISPUTE_CHANNELS.CFPB,
      count: pkg.cfpbRelevantCategories > 0 ? `${pkg.cfpbRelevantCategories}` : "—",
      detail:
        pkg.cfpbRelevantCategories > 0
          ? `Relevant to ${pkg.cfpbRelevantCategories} categor${pkg.cfpbRelevantCategories === 1 ? "y" : "ies"} on this round, if the consumer chooses to complain`
          : "Nothing on this round calls for a regulator complaint",
    },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Building2 className="h-5 w-5 text-status-info" />
        <h2 className="font-semibold">Channels for this round</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          Context, not a checklist
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        A round can be simply: establish the fact, choose the recipient, dispute, review the result.
        The two channels below the bureau are the consumer's own to use, and BES never files either.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {channels.map((c) => {
          const Icon = iconMap[c.icon as keyof typeof iconMap];
          return (
            <div key={c.key} className="rounded-xl border border-border bg-muted/30 p-4">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-status-info" />
                <span className="text-sm font-semibold text-foreground">{c.label}</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-foreground">{c.count}</p>
              <p className="text-xs text-muted-foreground">{c.detail}</p>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{c.description}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex items-start gap-2 rounded-xl border border-dashed border-border bg-muted/20 p-4">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          Your organization&rsquo;s own dispute SOP decides which of these it uses and when. BES shows
          what each channel is; it does not require any of them.
        </p>
      </div>
    </div>
  );
};
