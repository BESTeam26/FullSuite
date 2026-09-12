/**
 * One campaign, in full.
 *
 * Dee: "Campaign progress should derive from its work items rather than being
 * manually typed." So there is no percentage column anywhere — every number
 * here is counted from the work that points at this campaign, which means it
 * cannot be stale and cannot be wrong in a way nobody notices.
 *
 * A campaign still has no board of its own (Dee, 2026-09-12: "Do not make
 * Campaign itself another task board engine. It groups work."). Tasks and
 * Content below are two readings of the same rows: Content is the half that
 * carries publish metadata, Tasks is the rest.
 */
import { useMemo, useState } from "react";
import { ArrowLeft, CalendarRange, Flag, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { PartnerActivityTab } from "@/components/agency/partner/PartnerActivityTab";
import { PartnerFilesTab } from "@/components/agency/partner/PartnerFilesTab";
import {
  APPROVAL_LABEL, approvalStateOf, campaignProgress, contentThisWeek, isContent,
  type Campaign, type MarketingWorkItem,
} from "@/lib/marketing/marketing-domain";

const TABS = ["tasks", "content", "files", "activity"] as const;
type TabId = (typeof TABS)[number];
const TAB_LABEL: Record<TabId, string> = {
  tasks: "Tasks", content: "Content", files: "Files", activity: "Activity",
};

export function CampaignPage({
  campaign,
  partnerName,
  partnerGroupId,
  ownerName,
  work,
  onBack,
  onOpenItem,
}: {
  campaign: Campaign;
  partnerName: string | null;
  partnerGroupId: string | null;
  ownerName: string | null;
  work: MarketingWorkItem[];
  onBack: () => void;
  onOpenItem: (item: MarketingWorkItem) => void;
}) {
  const [tab, setTab] = useState<TabId>("tasks");
  const mine = useMemo(() => work.filter((w) => w.campaignId === campaign.id), [work, campaign.id]);
  const progress = campaignProgress(work, campaign.id);
  const awaiting = mine.filter((w) => approvalStateOf(w) === "awaiting").length;
  const thisWeek = contentThisWeek(mine).length;
  const content = mine.filter(isContent);
  const tasks = mine.filter((w) => !isContent(w));

  const rows = (list: MarketingWorkItem[], empty: string) =>
    list.length === 0 ? (
      <p className="px-1 py-6 text-center text-xs text-muted-foreground">{empty}</p>
    ) : (
      <ul className="overflow-hidden rounded-xl border border-border bg-card">
        {list.map((w) => (
          <li key={w.id} className="border-b border-border/60 last:border-b-0">
            <button
              type="button"
              onClick={() => onOpenItem(w)}
              className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{w.title}</span>
              {w.publishOn && (
                <span className="shrink-0 text-[11px] font-medium text-violet-800">{formatDate(w.publishOn)}</span>
              )}
              <span className="shrink-0 text-[11px] text-muted-foreground">{w.assigneeName ?? "Unassigned"}</span>
              <span className="w-36 shrink-0 truncate text-[11px] font-medium text-foreground">{w.statusLabel ?? ""}</span>
              <span className="w-32 shrink-0 truncate text-[11px] text-muted-foreground">
                {APPROVAL_LABEL[approvalStateOf(w)]}
              </span>
            </button>
          </li>
        ))}
      </ul>
    );

  return (
    <div className="space-y-3">
      <Button size="sm" variant="ghost" onClick={onBack} className="-ml-2">
        <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Campaigns
      </Button>

      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
              <Flag className="h-4 w-4 text-primary" /> {campaign.name}
            </h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
              <span>{partnerName ?? "BES Internal Marketing"}</span>
              <span className="inline-flex items-center gap-1">
                <User className="h-3 w-3" /> {ownerName ?? "No owner"}
              </span>
              {(campaign.startsOn || campaign.endsOn) && (
                <span className="inline-flex items-center gap-1">
                  <CalendarRange className="h-3 w-3" />
                  {campaign.startsOn ? formatDate(campaign.startsOn) : "—"} → {campaign.endsOn ? formatDate(campaign.endsOn) : "—"}
                </span>
              )}
              <span className="rounded border border-border bg-muted px-1.5 py-0.5 font-medium capitalize text-foreground">
                {campaign.status}
              </span>
            </p>
            {campaign.description && (
              <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-muted-foreground">{campaign.description}</p>
            )}
          </div>

          <div className="min-w-[12rem]">
            <p className="text-right text-xs font-semibold text-foreground">
              {progress.done} / {progress.total} items completed
            </p>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{ width: `${progress.percent}%` }}
                role="progressbar"
                aria-valuenow={progress.percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${campaign.name} progress`}
              />
            </div>
            <p className="mt-1 text-right text-[11px] tabular-nums text-muted-foreground">{progress.percent}%</p>
            <p className="mt-1 text-right text-[11px] text-muted-foreground">
              {awaiting} awaiting approval · {thisWeek} scheduled this week
            </p>
          </div>
        </div>
      </div>

      <nav aria-label="Campaign views" className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            aria-current={tab === t ? "page" : undefined}
            className={cn(
              "border-b-2 px-3.5 py-2 text-xs font-bold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </nav>

      {tab === "tasks" && rows(tasks, "No plain tasks in this campaign — everything in it is content.")}
      {tab === "content" && rows(content, "No content in this campaign yet.")}
      {tab === "files" && (partnerGroupId
        ? <PartnerFilesTab groupId={partnerGroupId} />
        : <p className="px-1 py-6 text-center text-xs text-muted-foreground">
            BES's own campaign has no partner to file documents against. Attach files to a task and they
            appear on its activity.
          </p>)}
      {tab === "activity" && (partnerGroupId
        ? <PartnerActivityTab groupId={partnerGroupId} />
        : <p className="px-1 py-6 text-center text-xs text-muted-foreground">
            Activity is recorded on each task. Open one to see everything that happened to it.
          </p>)}
    </div>
  );
}
