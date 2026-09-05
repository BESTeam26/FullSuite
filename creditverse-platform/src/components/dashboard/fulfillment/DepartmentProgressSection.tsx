/**
 * Department Progress — the operational truth for this client file, as data.
 *
 * One status per department (the Status Guide vocabulary), an assignee, and a
 * hand-off to the next department. Every change goes through
 * `set_client_department_status`, which validates the status, upserts the row
 * and writes the activity event in one transaction as the caller — the
 * database decides who may (BES within scope, or the organization's own
 * members for their own clients).
 *
 * Three truths stay separate on purpose: the client's CREDIT status and round
 * live on the client record (header); DEPARTMENT / WORK status lives here;
 * RESULTS live in the imported reports. Separation proposal step 1.
 */
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, Loader2, Lock } from "lucide-react";
import { useCreditOpsStore } from "@/lib/fulfillment/creditops-client-store";
import { useCreditOpsAccess, type CreditOpsDepartment } from "@/lib/fulfillment/creditops-access";
import { useAuth } from "@/lib/auth/auth-context";
import { errorMessage } from "@/lib/data/error-message";
import { setClientDepartmentStatus } from "@/lib/data/fulfillment-clients";
import { useOrgMembers } from "@/lib/data/use-workspaces";
import { useInvalidateDepartmentStatuses } from "@/lib/data/use-department-statuses";
import {
  CREDITOPS_DEPARTMENT_ORDER,
  currentDepartment,
  departmentStatuses,
  handoffEntryStatus,
  isOpenDepartmentStatus,
  nextDepartment,
} from "@/lib/fulfillment/department-domain";
import { OpsSelect } from "@/components/ui/ops-select";
import { cn } from "@/lib/utils";

interface Props {
  clientId: string;
}

const TITLE: Record<CreditOpsDepartment, string> = {
  Onboarding: "Onboarding",
  Dispute: "Dispute Processing",
  Support: "Client Success / Support",
  Complaints: "Complaints & Mailing",
  "Bureau Calling": "Bureau Calling",
};

export function DepartmentProgressSection({ clientId }: Props) {
  const store = useCreditOpsStore();
  const access = useCreditOpsAccess();
  const auth = useAuth();
  const live = auth.mode === "live";
  const client = store.clients.find((c) => c.id === clientId);
  const rows = store.getDepartmentStatuses(clientId);
  const { members } = useOrgMembers(live ? (client?.organizationId ?? null) : null);
  const invalidateLists = useInvalidateDepartmentStatuses();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const byDept = useMemo(() => new Map(rows.map((r) => [r.department, r])), [rows]);
  const current = currentDepartment(rows);
  const canEdit = live && access.canEditDepartmentProgress;

  const write = async (department: CreditOpsDepartment, status: string, assigneeId: string | null | undefined, note?: string) => {
    setBusy(department);
    setError(null);
    try {
      await setClientDepartmentStatus({ clientId, department, status, assigneeId, note });
      store.refreshDepartmentStatuses(clientId);
      void queryClient.invalidateQueries({ queryKey: ["activity"] });
      void invalidateLists();
    } catch (err) {
      setError(errorMessage(err, "Could not update the department status."));
    } finally {
      setBusy(null);
    }
  };

  const handOff = async (from: CreditOpsDepartment) => {
    const to = nextDepartment(from);
    if (!to) return;
    await write(to, handoffEntryStatus(to), null, `Handed off from ${from} to ${to}`);
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Department Progress</h3>
          <p className="text-[11px] text-muted-foreground">
            Work status by department — separate from the credit status
            {client ? ` (${client.status} · ${client.round})` : ""}.
            {current ? ` Currently with ${TITLE[current.department as CreditOpsDepartment] ?? current.department}.` : " No open department work."}
          </p>
        </div>
        {!canEdit && (
          <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
            <Lock className="h-3 w-3" /> {live ? "View only" : "Demo — read only"}
          </span>
        )}
      </div>

      <div className="space-y-2">
        {CREDITOPS_DEPARTMENT_ORDER.map((department) => {
          const row = byDept.get(department);
          const authorized = access.canLogDepartment(department);
          const editable = canEdit && authorized;
          const status = row?.status ?? null;
          const open = status ? isOpenDepartmentStatus(status) : false;
          const next = nextDepartment(department);
          return (
            <div
              key={department}
              className={cn(
                "grid gap-2 rounded-lg border p-3 md:grid-cols-[1.2fr_1.6fr_1.2fr_auto] md:items-center",
                open ? "border-emerald-500/40 bg-emerald-500/5" : "border-border bg-background",
              )}
            >
              <div className="min-w-0">
                <p className="text-xs font-bold text-foreground">{TITLE[department]}</p>
                <p className="text-[10px] text-muted-foreground">
                  {row ? `Updated ${new Date(row.updatedAt).toLocaleDateString()}` : "No status yet"}
                  {!authorized && " · not your department"}
                </p>
              </div>
              <OpsSelect
                value={status ?? ""}
                onValueChange={(v) => void write(department, v, row?.assigneeId ?? null)}
                options={[
                  ...(status ? [] : [{ value: "", label: "Set status…" }]),
                  ...departmentStatuses(department).map((st) => ({ value: st, label: st })),
                ]}
                disabled={!editable || busy === department}
                aria-label={`${TITLE[department]} status`}
              />
              <OpsSelect
                value={row?.assigneeId ?? ""}
                onValueChange={(v) => { if (status) void write(department, status, v || null); }}
                options={[{ value: "", label: "Unassigned" }, ...members.map((m) => ({ value: m.id, label: m.name }))]}
                disabled={!editable || !status || busy === department}
                aria-label={`${TITLE[department]} assignee`}
              />
              <button
                type="button"
                onClick={() => void handOff(department)}
                disabled={!editable || !next || !open || busy === department}
                title={next ? `Hand off to ${TITLE[next]}` : "Last department in the sequence"}
                className={cn(
                  "inline-flex items-center justify-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-colors",
                  editable && next && open
                    ? "border-primary/40 text-primary hover:bg-primary/10"
                    : "cursor-not-allowed border-border text-muted-foreground opacity-60",
                )}
              >
                {busy === department ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRightLeft className="h-3.5 w-3.5" />}
                Hand off
              </button>
            </div>
          );
        })}
      </div>
      {error && <p role="alert" className="text-xs text-status-danger">{error}</p>}
    </div>
  );
}
