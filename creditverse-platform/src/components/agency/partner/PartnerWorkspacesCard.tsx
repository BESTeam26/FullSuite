/**
 * Which operational workspaces this partner is in.
 *
 * Dee, 2026-09-24: "on BES PARTNERS, I don't see a way I can add the partner
 * in the creditops list as managed ops or outsourcing so it appear in the
 * creditops list."
 *
 * There was no way. Approve with Tiff had 71 imported clients and did not
 * appear in the CreditOps tree because her engagement was paused, and nothing
 * on any screen could change it — it took a migration. This is that control.
 *
 * ── IT IS AN ACCESS CONTROL, NOT A FILING PREFERENCE ──────────────────────
 *
 * The engagement is what authorizes BES to work the partner's files, so
 * starting one opens the partner's clients to the division and ending one
 * closes them. The card says so plainly rather than looking like a dropdown
 * for tidiness, and `set_partner_service` demands `partners.operations` — the
 * same capability as the sidebar's category move, not a second door.
 *
 * Ending deletes nothing, which is the part worth saying on the screen: the
 * partner, their clients, their history and their files all stay, and
 * choosing a category again resumes the relationship.
 */
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { OpsSelect } from "@/components/ui/ops-select";
import { useToast } from "@/hooks/use-toast";
import { requireSupabase } from "@/lib/supabase/client";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";
import { useFulfillment } from "@/lib/data/use-fulfillment";
import { isEngagementLive } from "@/lib/data/fulfillment-engagements";

/* The modules a partner can be engaged for. Labels are the words the
   navigation uses, so "where does this appear" has one answer. */
const MODULES: { service: string; label: string }[] = [
  { service: "creditops", label: "CreditOps" },
  { service: "fundingops", label: "FundingOps" },
  { service: "bes_crm", label: "BES CRM" },
  { service: "talentops", label: "TalentOps" },
  { service: "sales_marketing", label: "Sales & Marketing" },
];

const NONE = "__none__";

interface Category { id: string; module: string; key: string; label: string; is_automatic: boolean }

export function PartnerWorkspacesCard({ partnerId }: { partnerId: string }) {
  const perms = useAgencyPermissions();
  const qc = useQueryClient();
  const { toast } = useToast();
  const fulfillment = useFulfillment();
  const mayChange = perms.can("partners.operations");

  const cats = useQuery({
    queryKey: ["module-categories"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Category[]> => {
      const sb = requireSupabase();
      const { data, error } = await sb
        .from("module_categories")
        .select("id, module, key, label, is_automatic")
        .is("archived_at", null)
        .order("sort");
      if (error) throw error;
      return (data ?? []) as unknown as Category[];
    },
  });

  const set = useMutation({
    mutationFn: async ({ service, categoryId }: { service: string; categoryId: string | null }) => {
      const sb = requireSupabase();
      const { error } = await sb.rpc("set_partner_service" as never, {
        p_group: partnerId, p_service: service, p_category: categoryId,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      /* The trees read engagements; the partner page reads the same cache. */
      void qc.invalidateQueries({ queryKey: ["fulfillment-engagements"] });
      void qc.invalidateQueries({ queryKey: ["outsourcing-groups"] });
      toast({ title: "Workspace updated" });
    },
    onError: (e: Error) =>
      toast({ title: "That did not change", description: e.message, variant: "destructive" }),
  });

  /* The live engagement per module, from the cache the trees already use —
     one definition of "live", shared with the database's own. */
  const live = useMemo(() => {
    const out = new Map<string, { categoryId: string | null }>();
    for (const e of fulfillment.engagements) {
      if (e.outsourcingGroupId !== partnerId) continue;
      if (!isEngagementLive(e)) continue;
      out.set(e.service, { categoryId: e.operationalCategoryId ?? null });
    }
    return out;
  }, [fulfillment.engagements, partnerId]);

  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="border-b border-border px-4 py-2.5">
        <h2 className="text-xs font-bold text-foreground">Operational workspaces</h2>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Where this partner appears, and which BES team may work their files. Ending a workspace
          deletes nothing — the clients, files and history stay.
        </p>
      </header>

      {/* A failed load is not an empty one. Without this the card would say
          "No categories set up" against every module when the request simply
          did not come back — which reads as a configuration problem and sends
          somebody to fix the wrong thing. */}
      {cats.isError && (
        <p className="px-4 py-3 text-xs text-status-danger">
          The workspaces could not be loaded, so what this partner is in cannot be shown.
          {cats.error ? ` ${(cats.error as Error).message}` : ""}
        </p>
      )}

      <div className="divide-y divide-border">
        {MODULES.map((m) => {
          const options = (cats.data ?? []).filter((c) => c.module === m.service && !c.is_automatic);
          const current = live.get(m.service);
          const busy = set.isPending && set.variables?.service === m.service;

          return (
            <div key={m.service} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground">{m.label}</p>
                <p className="text-[11px] text-muted-foreground">
                  {current
                    ? "BES works this partner's files here."
                    : "Not in this workspace."}
                </p>
              </div>

              {cats.isLoading ? (
                <span className="h-5 w-24 animate-pulse rounded bg-muted" aria-hidden />
              ) : cats.isError ? (
                <span className="text-[11px] text-muted-foreground">Unknown</span>
              ) : options.length === 0 ? (
                /* Genuinely nothing configured for this module. An empty
                   dropdown is a dead control, so it is not offered. */
                <span className="text-[11px] text-muted-foreground">No categories set up</span>
              ) : mayChange ? (
                <div className="flex items-center gap-2">
                  {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                  <OpsSelect
                    aria-label={`${m.label} workspace`}
                    value={current?.categoryId ?? NONE}
                    options={[
                      { value: NONE, label: "Not engaged" },
                      ...options.map((c) => ({ value: c.id, label: c.label })),
                    ]}
                    onValueChange={(next) =>
                      set.mutate({ service: m.service, categoryId: next === NONE ? null : next })
                    }
                  />
                </div>
              ) : (
                <span className="text-[11px] font-medium text-foreground">
                  {current
                    ? options.find((c) => c.id === current.categoryId)?.label ?? "Engaged"
                    : "Not engaged"}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
