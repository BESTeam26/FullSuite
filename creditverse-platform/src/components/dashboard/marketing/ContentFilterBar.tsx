/**
 * The questions Dee needs answered in one glance.
 *
 *   "What is scheduled for Nainoa this week?"
 *   "What does Roniel need to finish?"
 *   "Which posts are waiting for Partner approval?"
 *
 * Each is one control. Options come from the ROWS ON SCREEN rather than from a
 * fixed list, so a platform nobody uses is not offered and a platform somebody
 * added to the workspace appears without a release.
 */
import { useMemo } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OpsSelect } from "@/components/ui/ops-select";
import {
  APPROVAL_LABEL, type ApprovalState, type MarketingWorkItem, type WorkFilters,
} from "@/lib/marketing/marketing-domain";
import type { WorkspaceStatus } from "@/lib/workspaces/workspace-domain";

const ALL = "__all__";
const BES = "__bes__";

/** Distinct, sorted, blanks dropped — a filter offering "" helps nobody. */
const distinct = (values: (string | null)[]): string[] =>
  [...new Set(values.filter((v): v is string => !!v?.trim()))].sort((a, b) => a.localeCompare(b));

export function ContentFilterBar({
  items,
  statuses,
  showPartner,
  filters,
  onChange,
}: {
  items: MarketingWorkItem[];
  statuses: WorkspaceStatus[];
  /** The partner control is pointless inside one partner's own workspace. */
  showPartner: boolean;
  filters: WorkFilters;
  onChange: (next: WorkFilters) => void;
}) {
  const options = useMemo(() => {
    const partners = new Map<string, string>();
    let hasBes = false;
    for (const i of items) {
      if (i.partnerGroupId && i.partnerName) partners.set(i.partnerGroupId, i.partnerName);
      else if (!i.partnerGroupId) hasBes = true;
    }
    return {
      partners: [...partners.entries()].sort((a, b) => a[1].localeCompare(b[1])),
      hasBes,
      channels: distinct(items.map((i) => i.channel)),
      campaigns: [...new Map(items.filter((i) => i.campaignId && i.campaignName)
        .map((i) => [i.campaignId as string, i.campaignName as string])).entries()]
        .sort((a, b) => a[1].localeCompare(b[1])),
      assignees: [...new Map(items.filter((i) => i.assignedTo && i.assigneeName)
        .map((i) => [i.assignedTo as string, i.assigneeName as string])).entries()]
        .sort((a, b) => a[1].localeCompare(b[1])),
    };
  }, [items]);

  const set = (patch: Partial<WorkFilters>) => onChange({ ...filters, ...patch });
  const pick = (v: string) => (v === ALL ? null : v);

  const active =
    !!filters.partnerGroupId || !!filters.channel || !!filters.campaignId ||
    !!filters.assignedTo || !!filters.statusKey || !!filters.approvalState;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {showPartner && (options.partners.length > 0 || options.hasBes) && (
        <OpsSelect
          aria-label="Partner"
          size="sm"
          value={filters.partnerGroupId ?? ALL}
          onValueChange={(v) => set({ partnerGroupId: pick(v) })}
          options={[
            { value: ALL, label: "Every partner" },
            ...(options.hasBes ? [{ value: BES, label: "BES Internal" }] : []),
            ...options.partners.map(([id, name]) => ({ value: id, label: name })),
          ]}
        />
      )}
      {options.channels.length > 0 && (
        <OpsSelect
          aria-label="Platform"
          size="sm"
          value={filters.channel ?? ALL}
          onValueChange={(v) => set({ channel: pick(v) })}
          options={[{ value: ALL, label: "Every platform" },
            ...options.channels.map((c) => ({ value: c, label: c }))]}
        />
      )}
      {options.campaigns.length > 0 && (
        <OpsSelect
          aria-label="Campaign"
          size="sm"
          value={filters.campaignId ?? ALL}
          onValueChange={(v) => set({ campaignId: pick(v) })}
          options={[{ value: ALL, label: "Every campaign" },
            ...options.campaigns.map(([id, name]) => ({ value: id, label: name }))]}
        />
      )}
      {options.assignees.length > 0 && (
        <OpsSelect
          aria-label="Assignee"
          size="sm"
          value={filters.assignedTo ?? ALL}
          onValueChange={(v) => set({ assignedTo: pick(v) })}
          options={[{ value: ALL, label: "Anyone" },
            ...options.assignees.map(([id, name]) => ({ value: id, label: name }))]}
        />
      )}
      {statuses.length > 0 && (
        <OpsSelect
          aria-label="Status"
          size="sm"
          value={filters.statusKey ?? ALL}
          onValueChange={(v) => set({ statusKey: pick(v) })}
          options={[{ value: ALL, label: "Every status" },
            ...statuses.map((s) => ({ value: s.key, label: s.label }))]}
        />
      )}
      <OpsSelect
        aria-label="Approval state"
        size="sm"
        value={filters.approvalState ?? ALL}
        onValueChange={(v) => set({ approvalState: v === ALL ? null : (v as ApprovalState) })}
        options={[{ value: ALL, label: "Any approval state" },
          ...(Object.keys(APPROVAL_LABEL) as ApprovalState[])
            .map((k) => ({ value: k, label: APPROVAL_LABEL[k] }))]}
      />
      {active && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onChange({ openOnly: filters.openOnly, search: filters.search })}
        >
          <X className="mr-1 h-3.5 w-3.5" /> Clear
        </Button>
      )}
    </div>
  );
}
