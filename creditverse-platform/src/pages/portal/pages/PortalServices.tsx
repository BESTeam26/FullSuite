/**
 * Everything BES is doing for this partner, across every module.
 *
 * Dee, 2026-09-13: "Replace the CRM-only projection with a true cross-module
 * Partner view." The old page showed BES CRM builds and nothing else, so a
 * partner buying CreditOps fulfilment and marketing opened it to an empty
 * list.
 *
 * One card per LIVE engagement — the same record that authorizes the work, so
 * a module cannot appear here without being authorized and cannot be
 * authorized without appearing. Each card says what that module can honestly
 * say about progress and nothing more: no work items, no internal assignee,
 * no health reason, no rates.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowRight, Briefcase, CalendarDays, Loader2, Workflow } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { requireSupabase } from "@/lib/supabase/client";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";

interface PartnerService {
  engagementId: string;
  module: string;
  moduleLabel: string;
  serviceLabel: string;
  status: string;
  startedOn: string | null;
  endsOn: string | null;
  milestone: string | null;
  openItems: number;
  linkKind: string | null;
}

const MODULE_TONE: Record<string, string> = {
  creditops: "border-emerald-500/40 bg-emerald-500/10 text-emerald-900",
  fundingops: "border-sky-500/40 bg-sky-500/10 text-sky-900",
  bes_crm: "border-violet-500/40 bg-violet-500/10 text-violet-900",
  talentops: "border-amber-500/40 bg-amber-500/10 text-amber-900",
  sales_marketing: "border-pink-500/40 bg-pink-500/10 text-pink-900",
};

const STATUS_TONE: Record<string, string> = {
  Active: "text-status-success",
  Paused: "text-amber-700",
  Pending: "text-muted-foreground",
  Ended: "text-muted-foreground",
};

export function PortalServices() {
  const auth = useAuth();
  const services = useQuery({
    queryKey: ["portal", "services"],
    enabled: auth.mode === "live" && auth.status === "signed-in",
    staleTime: 60_000,
    queryFn: async (): Promise<PartnerService[]> => {
      const { data, error } = await requireSupabase().rpc("my_partner_services" as never);
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        engagementId: r.engagement_id as string,
        module: r.module as string,
        moduleLabel: r.module_label as string,
        serviceLabel: r.service_label as string,
        status: r.status as string,
        startedOn: (r.started_on as string) ?? null,
        endsOn: (r.ends_on as string) ?? null,
        milestone: (r.milestone as string) ?? null,
        openItems: Number(r.open_items ?? 0),
        linkKind: (r.link_kind as string) ?? null,
      }));
    },
  });

  if (services.isLoading) {
    return <p className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></p>;
  }

  const rows = services.data ?? [];
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
        <Workflow className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
        <p className="text-sm font-semibold text-foreground">No active services</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          What BES is delivering for you appears here as soon as an engagement starts. Your history
          stays on your account whatever is running today.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {rows.map((s) => (
        <section key={s.engagementId} className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <span className={cn("inline-block rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                MODULE_TONE[s.module] ?? "border-border bg-muted text-foreground")}>
                {s.moduleLabel}
              </span>
              <h2 className="mt-1.5 text-sm font-bold text-foreground">{s.serviceLabel}</h2>
            </div>
            <span className={cn("shrink-0 text-xs font-semibold", STATUS_TONE[s.status] ?? "text-foreground")}>
              {s.status}
            </span>
          </div>

          <dl className="mt-2 space-y-1">
            {s.startedOn && (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <CalendarDays className="h-3 w-3 shrink-0" />
                Started {formatDate(s.startedOn)}
                {s.endsOn && ` · ends ${formatDate(s.endsOn)}`}
              </div>
            )}
            {s.milestone && (
              <div className="flex items-center gap-1.5 text-[11px] text-foreground">
                <Briefcase className="h-3 w-3 shrink-0 text-muted-foreground" />
                {s.milestone}
              </div>
            )}
          </dl>

          {s.linkKind === "clients" && (
            <Link to="/partner/clients"
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              View clients <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </section>
      ))}
    </div>
  );
}
