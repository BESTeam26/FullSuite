/**
 * FundingOps department / work status — per FUNDING FILE (separation step 3).
 * One status per department, an assignee, and a hand-off to the next
 * department, written through `set_funding_department_status` (vocabulary
 * validated, activity event in the same transaction, policies decide).
 * The file's funding stage and the client's lifecycle stay their own truths.
 */
import { useMemo, useState } from "react";
import { formatDate } from "@/lib/format-date";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, Loader2, Lock } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { errorMessage } from "@/lib/data/error-message";
import { setFundingDepartmentStatus } from "@/lib/data/funding-clients";
import { useOrgMembers } from "@/lib/data/use-workspaces";
import { useFundingOpsStore } from "@/lib/fulfillment/fundingops-client-store";
import { useFundingOpsAccess } from "@/lib/fulfillment/fundingops-access";
import type { FundingDepartment } from "@/lib/fulfillment/fundingops-store-types";
import type { FundingFile } from "@/lib/fulfillment/fundingops-domain";
import {
  FUNDINGOPS_DEPARTMENT_ORDER,
  fundingDepartmentStatuses,
  fundingHandoffEntryStatus,
  isOpenFundingStatus,
  nextFundingDepartment,
} from "@/lib/fulfillment/funding-department-domain";
import { OpsSelect } from "@/components/ui/ops-select";
import { cn } from "@/lib/utils";

interface Props {
  clientId: string;
  organizationId: string | null;
  files: FundingFile[];
}

export function FundingFileDepartmentProgress({ clientId, organizationId, files }: Props) {
  const store = useFundingOpsStore();
  const access = useFundingOpsAccess();
  const auth = useAuth();
  const live = auth.mode === "live";
  const queryClient = useQueryClient();
  const rows = store.getDepartmentStatuses(clientId);
  const { members } = useOrgMembers(live ? organizationId : null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canEdit = live && access.canEditStageProgress;

  const byFile = useMemo(() => {
    const m = new Map<string, Map<string, (typeof rows)[number]>>();
    for (const r of rows) {
      const key = r.fileId ?? "__legacy__";
      if (!m.has(key)) m.set(key, new Map());
      m.get(key)!.set(r.department, r);
    }
    return m;
  }, [rows]);

  const write = async (fileId: string, department: FundingDepartment, status: string, assigneeId: string | null | undefined, note?: string) => {
    setBusy(`${fileId}:${department}`); setError(null);
    try {
      await setFundingDepartmentStatus({ fileId, department, status, assigneeId, note });
      store.refreshDepartmentStatuses(clientId);
      void queryClient.invalidateQueries({ queryKey: ["activity"] });
    } catch (e) { setError(errorMessage(e, "Could not update the department status.")); }
    finally { setBusy(null); }
  };

  if (files.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Department Progress</h3>
        <p className="mt-1 text-xs text-muted-foreground">No funding file yet. Department work is tracked per funding file.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {files.map((file) => {
        const fileRows = byFile.get(file.id) ?? new Map();
        return (
          <div key={file.id} className="space-y-2 rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Department Progress — {file.purpose}</h3>
                <p className="text-[11px] text-muted-foreground">
                  ${file.requestedAmount.toLocaleString()} requested · funding stage {file.stage} (separate from department work)
                </p>
              </div>
              {!canEdit && (
                <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                  <Lock className="h-3 w-3" /> {live ? "View only" : "Demo — read only"}
                </span>
              )}
            </div>
            {FUNDINGOPS_DEPARTMENT_ORDER.map((department) => {
              const row = fileRows.get(department);
              const authorized = access.canLogStage(department);
              const editable = canEdit && authorized;
              const status = row?.status ?? null;
              const open = status ? isOpenFundingStatus(status) : false;
              const next = nextFundingDepartment(department);
              const key = `${file.id}:${department}`;
              return (
                <div
                  key={department}
                  className={cn(
                    "grid gap-2 rounded-lg border p-3 md:grid-cols-[1.2fr_1.6fr_1.2fr_auto] md:items-center",
                    open ? "border-emerald-500/40 bg-emerald-500/5" : "border-border bg-background",
                  )}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-foreground">{department}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {row ? `Updated ${formatDate(row.updatedAt)}` : "No status yet"}
                      {!authorized && " · not your department"}
                    </p>
                  </div>
                  <OpsSelect
                    value={status ?? ""}
                    onValueChange={(v) => void write(file.id, department, v, row?.assigneeId ?? null)}
                    options={[...(status ? [] : [{ value: "", label: "Set status…" }]), ...fundingDepartmentStatuses(department).map((st) => ({ value: st, label: st }))]}
                    disabled={!editable || busy === key}
                    aria-label={`${department} status`}
                  />
                  <OpsSelect
                    value={row?.assigneeId ?? ""}
                    onValueChange={(v) => { if (status) void write(file.id, department, status, v || null); }}
                    options={[{ value: "", label: "Unassigned" }, ...members.map((m) => ({ value: m.id, label: m.name }))]}
                    disabled={!editable || !status || busy === key}
                    aria-label={`${department} assignee`}
                  />
                  <button
                    type="button"
                    onClick={() => { if (next) void write(file.id, next, fundingHandoffEntryStatus(next), null, `Handed off from ${department} to ${next}`); }}
                    disabled={!editable || !next || !open || busy === key}
                    title={next ? `Hand off to ${next}` : "Last department in the sequence"}
                    className={cn(
                      "inline-flex items-center justify-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-colors",
                      editable && next && open ? "border-primary/40 text-primary hover:bg-primary/10" : "cursor-not-allowed border-border text-muted-foreground opacity-60",
                    )}
                  >
                    {busy === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRightLeft className="h-3.5 w-3.5" />}
                    Hand off
                  </button>
                </div>
              );
            })}
          </div>
        );
      })}
      {error && <p role="alert" className="text-xs text-status-danger">{error}</p>}
    </div>
  );
}
