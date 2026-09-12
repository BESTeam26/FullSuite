/**
 * Campaigns — a grouping of marketing work with its own dates, owner and
 * status.
 *
 * Dee: "Add the one genuinely new concept: campaigns. Keep it small… Do not
 * make Campaign itself another task board engine. It groups work."
 *
 * So a campaign has no board, no statuses of its own and no tasks of its own.
 * It has a name, a window, a status and a progress bar counted from the work
 * items that point at it — and clicking it filters the task list, which is the
 * board it would otherwise have duplicated.
 */
import { useState } from "react";
import { CalendarRange, Flag, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { OpsSelect } from "@/components/ui/ops-select";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { campaignProgress, type Campaign, type MarketingWorkItem } from "@/lib/marketing/marketing-domain";

const STATUS_TONE: Record<Campaign["status"], string> = {
  planned: "border-border bg-muted text-muted-foreground",
  active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-800",
  paused: "border-amber-500/30 bg-amber-500/10 text-amber-800",
  completed: "border-sky-500/30 bg-sky-500/10 text-sky-800",
  archived: "border-border bg-muted text-muted-foreground",
};

const STATUS_OPTIONS = (["planned", "active", "paused", "completed", "archived"] as const)
  .map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }));

export function CampaignsView({
  campaigns,
  work,
  loading,
  canWork,
  /** Null in the global view, where a new campaign has no single workspace. */
  workspaceId,
  onCreate,
  onUpdate,
  onOpenCampaign,
}: {
  campaigns: Campaign[];
  work: MarketingWorkItem[];
  loading: boolean;
  canWork: boolean;
  workspaceId: string | null;
  onCreate: (input: { name: string; description: string | null; startsOn: string | null; endsOn: string | null }) => Promise<void>;
  onUpdate: (id: string, patch: Partial<Pick<Campaign, "status" | "name">>) => void;
  onOpenCampaign: (campaign: Campaign) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onCreate({
        name,
        description: description.trim() || null,
        startsOn: startsOn || null,
        endsOn: endsOn || null,
      });
      setCreating(false);
      setName(""); setDescription(""); setStartsOn(""); setEndsOn("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          A campaign groups work. It has no board of its own — opening one filters the task list.
        </p>
        {canWork && workspaceId && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> New campaign
          </Button>
        )}
      </div>

      {loading ? (
        <p className="py-8 text-center text-xs text-muted-foreground">Loading…</p>
      ) : campaigns.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
          <Flag className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">No campaigns yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            {workspaceId
              ? "Create one when a set of work belongs together — a launch, a month of content, a promotion."
              : "Campaigns are created inside a workspace, so open BES Internal Marketing or a partner first."}
          </p>
        </div>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((c) => {
            const p = campaignProgress(work, c.id);
            return (
              <ContentCard
                key={c.id}
                title={
                  <button
                    type="button"
                    onClick={() => onOpenCampaign(c)}
                    className="text-left hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {c.name}
                  </button>
                }
              >
                <div className="flex flex-wrap items-center gap-2">
                  {canWork ? (
                    <OpsSelect
                      aria-label={`Status of ${c.name}`}
                      size="inline"
                      value={c.status}
                      onValueChange={(v) => onUpdate(c.id, { status: v as Campaign["status"] })}
                      options={STATUS_OPTIONS}
                    />
                  ) : (
                    <span className={cn("rounded border px-1.5 py-0.5 text-[11px] font-medium", STATUS_TONE[c.status])}>
                      {c.status}
                    </span>
                  )}
                  {(c.startsOn || c.endsOn) && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <CalendarRange className="h-3 w-3" />
                      {c.startsOn ? formatDate(c.startsOn) : "—"} → {c.endsOn ? formatDate(c.endsOn) : "—"}
                    </span>
                  )}
                </div>
                {c.description && (
                  <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{c.description}</p>
                )}
                <div className="mt-2">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{p.total === 0 ? "No work yet" : `${p.done} of ${p.total} done`}</span>
                    <span className="tabular-nums">{p.percent}%</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-[width]"
                      style={{ width: `${p.percent}%` }}
                      role="progressbar"
                      aria-valuenow={p.percent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${c.name} progress`}
                    />
                  </div>
                </div>
              </ContentCard>
            );
          })}
        </div>
      )}

      <Sheet open={creating} onOpenChange={setCreating}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>New campaign</SheetTitle>
            <SheetDescription>
              A name and, when you know them, the dates it runs between. Work is added to it from
              each task.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Name</span>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-8 text-xs" autoFocus />
            </label>
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">What it is for</span>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="mt-1 text-xs" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Starts</span>
                <Input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className="mt-1 h-8 text-xs" />
              </label>
              <label className="block">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Ends</span>
                <Input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} className="mt-1 h-8 text-xs" />
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setCreating(false)}>Cancel</Button>
              <Button size="sm" disabled={!name.trim() || saving} onClick={() => void submit()}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create campaign"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
