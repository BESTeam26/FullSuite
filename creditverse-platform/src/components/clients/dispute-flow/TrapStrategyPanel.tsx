// TRAP Strategy Panel — shows CRA + FTC + CFPB multi-channel pressure
import { Building2, ShieldAlert, Scale, ArrowRight } from "lucide-react";
import { TRAP_CHANNELS } from "@/lib/dispute/letters-and-channels";
import type { DisputePackage } from "@/lib/dispute/package-builder";

const iconMap = {
  Building2,
  ShieldAlert,
  Scale,
} as const;

export const TrapStrategyPanel = ({ pkg }: { pkg: DisputePackage }) => {
  const channels = [
    {
      key: "CRA" as const,
      ...TRAP_CHANNELS.CRA,
      count: pkg.totalItems,
      detail: `${pkg.mailPieces} mail piece${pkg.mailPieces === 1 ? "" : "s"} across ${pkg.totalLetters} letter${pkg.totalLetters === 1 ? "" : "s"}`,
    },
    {
      key: "FTC" as const,
      ...TRAP_CHANNELS.FTC,
      count: pkg.ftcFilings,
      detail:
        pkg.ftcFilings > 0
          ? `${pkg.ftcFilings} FTC filing${pkg.ftcFilings === 1 ? "" : "s"} required`
          : "No FTC filings required this round",
    },
    {
      key: "CFPB" as const,
      ...TRAP_CHANNELS.CFPB,
      count: pkg.cfpbComplaints,
      detail:
        pkg.cfpbComplaints > 0
          ? `${pkg.cfpbComplaints} CFPB complaint${pkg.cfpbComplaints === 1 ? "" : "s"} by category`
          : "No CFPB complaints required this round",
    },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-5 w-5 text-status-success" />
        <h2 className="font-semibold">TRAP Strategy</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          CRA + FTC + CFPB
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Multi-channel pressure from Round 1. Every channel fires simultaneously
        to establish the compliance record.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {channels.map((c) => {
          const Icon = iconMap[c.icon as keyof typeof iconMap];
          return (
            <div
              key={c.key}
              className="rounded-xl border border-border bg-muted/30 p-4"
            >
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-status-success" />
                <span className="text-sm font-semibold">{c.label}</span>
              </div>
              <p className="mt-2 text-2xl font-bold">{c.count}</p>
              <p className="text-xs text-muted-foreground">{c.detail}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/30 p-4 text-xs">
        <span className="font-medium">Mailing & submission order:</span>
        {pkg.mailingInstructions.map((step, i) => (
          <span key={step} className="flex items-center gap-1">
            <span className="text-muted-foreground">{i + 1}.</span>
            <span>{step}</span>
            {i < pkg.mailingInstructions.length - 1 && (
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
            )}
          </span>
        ))}
      </div>
    </div>
  );
};
