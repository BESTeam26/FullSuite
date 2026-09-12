/**
 * Paste a planning sheet; see exactly what it will do; then confirm.
 *
 * Dee, 2026-09-13: "we use to generate campaign via GPT, manually uploading
 * this info here is chaotic and waste of time."
 *
 * Two steps, always. The first reads the paste and shows the plan — what is
 * created, what is updated, which rows could not be read and why, which
 * campaigns are new, which columns nobody mapped. The second writes it.
 * Nothing is written from step one, so a wrong paste costs a click rather than
 * an afternoon of cleaning up.
 *
 * A row removed from the sheet deletes nothing. Work in progress is not the
 * spreadsheet's to revoke, and the dialog says so where somebody will read it.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardPaste, Loader2, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  parseDelimited, planImport, planIsEmpty, type ExistingItem, type ImportPlan,
} from "@/lib/marketing/sheet-import";
import type { ImportOutcome, ImportContext } from "@/lib/data/marketing";

const EXAMPLE = "ID\tTitle\tPublish Date\tChannel\tContent Type\tCampaign\tCaption\tAssignee";

const Stat = ({ icon: Icon, n, label, tone }: {
  icon: typeof Plus; n: number; label: string; tone: string;
}) => (
  <div className="rounded-lg border border-border bg-card px-3 py-2">
    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      <Icon className="h-3.5 w-3.5" /> {label}
    </p>
    <p className={cn("mt-0.5 text-xl font-bold tabular-nums", n === 0 ? "text-muted-foreground" : tone)}>{n}</p>
  </div>
);

export function SheetImportDialog({
  workspaceName,
  existing,
  campaignNames,
  onClose,
  onApply,
}: {
  workspaceName: string;
  existing: ExistingItem[];
  campaignNames: string[];
  onClose: () => void;
  onApply: (plan: ImportPlan) => Promise<ImportOutcome>;
}) {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);

  const plan = useMemo<ImportPlan | null>(() => {
    if (!text.trim()) return null;
    return planImport({ rows: parseDelimited(text), existing, campaigns: campaignNames });
  }, [text, existing, campaignNames]);

  const apply = async () => {
    if (!plan) return;
    setBusy(true);
    try {
      const result = await onApply(plan);
      setOutcome(result);
      setConfirmed(true);
      toast({
        title: result.failed.length === 0 ? "Import finished" : "Import finished with problems",
        description: `${result.created} created, ${result.updated} updated` +
          (result.failed.length > 0 ? `, ${result.failed.length} failed` : ""),
        variant: result.failed.length > 0 ? "destructive" : undefined,
      });
    } catch (e) {
      toast({ title: "Nothing was imported", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Import from a spreadsheet</SheetTitle>
          <SheetDescription>
            Select the rows in your sheet, copy, and paste them below — heading row included.
            Nothing is written until you have seen what it will do.
          </SheetDescription>
        </SheetHeader>

        {confirmed && outcome ? (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-status-success" />
              <p className="text-sm text-foreground">
                {outcome.created} created · {outcome.updated} updated
                {outcome.campaignsCreated > 0 && ` · ${outcome.campaignsCreated} new ${outcome.campaignsCreated === 1 ? "campaign" : "campaigns"}`}
              </p>
            </div>
            {outcome.failed.length > 0 && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
                <p className="text-xs font-semibold text-red-800">
                  {outcome.failed.length} {outcome.failed.length === 1 ? "row" : "rows"} did not import
                </p>
                <ul className="mt-1 space-y-0.5">
                  {outcome.failed.map((f) => (
                    <li key={f.line} className="text-[11px] text-foreground">
                      Row {f.line} · {f.title} — {f.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Button size="sm" onClick={onClose}>Done</Button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              placeholder={`${EXAMPLE}\n1\tOctober carousel\t2026-10-05\tInstagram\tCarousel\tQ4 Launch\t…`}
              aria-label="Paste your spreadsheet rows"
              className="font-mono text-[11px] leading-relaxed"
            />
            <p className="text-[11px] text-muted-foreground">
              Recognised columns: ID, Title, Publish Date, Channel, Content Type, Caption, Campaign,
              Assignee, Status, Due Date, Notes. An <strong>ID</strong> column is worth adding — it is
              what lets you paste an edited sheet again and have it update rather than duplicate.
            </p>

            {plan && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <Stat icon={Plus} n={plan.creates.length} label="Create" tone="text-status-success" />
                  <Stat icon={RefreshCw} n={plan.updates.length} label="Update" tone="text-foreground" />
                  <Stat icon={AlertTriangle} n={plan.skipped.length} label="Skipped" tone="text-amber-700" />
                </div>

                {plan.matchedOnTitle && (plan.creates.length > 0 || plan.updates.length > 0) && (
                  <p className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-900">
                    There is no ID column, so rows are matched on their title. If you renamed a post in
                    the sheet it will arrive here as a new task rather than an edit of the old one.
                  </p>
                )}

                {plan.unmappedColumns.length > 0 && (
                  <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
                    Ignored, because nothing here knows what they mean:{" "}
                    <span className="font-medium text-foreground">{plan.unmappedColumns.join(", ")}</span>
                  </p>
                )}

                {plan.newCampaigns.length > 0 && (
                  <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
                    New {plan.newCampaigns.length === 1 ? "campaign" : "campaigns"} to be created:{" "}
                    <span className="font-medium text-foreground">{plan.newCampaigns.join(", ")}</span>
                  </p>
                )}

                {plan.skipped.length > 0 && (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                    <p className="text-xs font-semibold text-amber-900">These rows will be left out</p>
                    <ul className="mt-1 space-y-0.5">
                      {plan.skipped.map((s) => (
                        <li key={s.line} className="text-[11px] text-foreground">Row {s.line} — {s.reason}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {!planIsEmpty(plan) && (
                  <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
                    <table className="w-full text-left text-[11px]">
                      <thead className="sticky top-0 bg-muted/70">
                        <tr>
                          <th className="px-2 py-1 font-semibold text-muted-foreground">What</th>
                          <th className="px-2 py-1 font-semibold text-muted-foreground">Title</th>
                          <th className="px-2 py-1 font-semibold text-muted-foreground">Publishes</th>
                          <th className="px-2 py-1 font-semibold text-muted-foreground">Campaign</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...plan.creates.map((r) => ["New", r] as const),
                          ...plan.updates.map((r) => ["Update", r] as const)].map(([kind, r]) => (
                          <tr key={`${kind}-${r.line}`} className="border-t border-border/60">
                            <td className={cn("px-2 py-1 font-medium", kind === "New" ? "text-status-success" : "text-muted-foreground")}>{kind}</td>
                            <td className="px-2 py-1 text-foreground">{r.title}</td>
                            <td className="px-2 py-1 text-muted-foreground">{r.publishOn ?? "—"}</td>
                            <td className="px-2 py-1 text-muted-foreground">{r.campaign ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <p className="text-[11px] text-muted-foreground">
                  Importing into <span className="font-medium text-foreground">{workspaceName}</span>. Work
                  already here that is not in your sheet is left exactly as it is — this never deletes.
                </p>
              </>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
              <Button size="sm" disabled={!plan || planIsEmpty(plan) || busy} onClick={() => void apply()}>
                {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ClipboardPaste className="mr-1.5 h-3.5 w-3.5" />}
                {plan && !planIsEmpty(plan)
                  ? `Import ${plan.creates.length + plan.updates.length} ${plan.creates.length + plan.updates.length === 1 ? "row" : "rows"}`
                  : "Import"}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
