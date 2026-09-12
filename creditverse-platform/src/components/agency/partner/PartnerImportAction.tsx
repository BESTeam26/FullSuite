/**
 * Import this partner's clients from ClickUp.
 *
 * The partner remembers its own ClickUp list, so nobody types an id — Dee's
 * requirement. Where no list is linked yet, the action says so and offers to
 * link one rather than hiding, because "there is nothing to import" and "this
 * partner has never been mapped" are different facts.
 *
 * The button is shown only to somebody holding the import capability, and the
 * database refuses everybody else regardless: the whole import runs on the
 * caller's own session, so a person who may not import gets nothing written
 * even if they call the function directly.
 */
import { useState } from "react";
import { cn } from "@/lib/utils";
import { describeClickUpRef, parseClickUpListRef } from "@/lib/migration/clickup-list-ref";
import { DownloadCloud, Loader2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";
import { usePartnerActions } from "@/lib/data/use-agency-partners";
import {
  listIdFromSourceRef, runClickUpImport, type ImportSummary,
} from "@/lib/data/clickup-import";
import type { AgencyPartner } from "@/lib/data/agency-partners";

export function PartnerImportAction({ partner }: { partner: AgencyPartner & { sourceListRef?: string | null } }) {
  const perms = useAgencyPermissions();
  const actions = usePartnerActions();
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [linking, setLinking] = useState(false);
  const [listInput, setListInput] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ImportSummary | null>(null);

  if (!perms.can("creditops.clients.import")) return null;

  const listId = listIdFromSourceRef(partner.sourceListRef);

  const run = async () => {
    if (!listId) return;
    setRunning(true);
    setResult(null);
    try {
      const summary = await runClickUpImport(partner.id, listId);
      setResult(summary);
      toast({
        title: "Import finished",
        description: `${summary.created} created, ${summary.matched} matched, ${summary.secrets} secrets stored.`,
      });
    } catch (e) {
      toast({ title: "The import did not run", description: (e as Error).message, variant: "destructive" });
    } finally {
      setRunning(false);
      setConfirming(false);
    }
  };

  /* Understood as you type, so a wrong link is refused before it is stored
     rather than after it has imported somebody else's clients. */
  const parsed = parseClickUpListRef(listInput);

  const link = async () => {
    if (!parsed) return;
    try {
      await actions.update.mutateAsync({ id: partner.id, patch: { sourceListRef: parsed.ref } });
      toast({ title: "ClickUp list linked", description: describeClickUpRef(parsed) });
      setLinking(false);
      setListInput("");
    } catch (e) {
      toast({ title: "Could not link the list", description: (e as Error).message, variant: "destructive" });
    }
  };

  /**
   * Unlink the list. Deliberately NOT "delete the import".
   *
   * It forgets WHERE to import from next time and touches nothing that was
   * ever imported — every client, comment, attachment and credential stays
   * exactly where it is, and the crosswalk that makes a re-run update rather
   * than duplicate is untouched. Linking the same list again resumes.
   */
  const unlink = async () => {
    try {
      await actions.update.mutateAsync({ id: partner.id, patch: { sourceListRef: null } });
      toast({
        title: "ClickUp list unlinked",
        description: "Nothing already imported was changed.",
      });
    } catch (e) {
      toast({ title: "Could not unlink the list", description: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={running}
          onClick={() => (listId ? setConfirming(true) : setLinking(true))}
        >
          {running ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <DownloadCloud className="mr-2 h-3.5 w-3.5" />}
          {running ? "Importing…" : "Import from ClickUp"}
        </Button>
        {listId ? (
          /* The list id was read-only text, so a wrong one could not be
             corrected and a stale one could not be removed (Dee,
             2026-09-12). */
          <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <span>List {listId}</span>
            <button
              type="button"
              onClick={() => { setListInput(listId); setLinking(true); }}
              className="font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Change
            </button>
            <button
              type="button"
              disabled={actions.update.isPending}
              onClick={() => void unlink()}
              className="font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              Unlink
            </button>
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">No ClickUp list linked yet</span>
        )}
      </div>

      {result && (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-lg border border-border bg-muted/30 p-3 text-xs sm:grid-cols-4">
          {([
            ["Found", result.found], ["Matched", result.matched], ["Created", result.created],
            ["Skipped", result.skipped], ["Comments", result.comments],
            ["Attachments", result.attachments], ["Secrets", result.secrets],
            ["Needs review", result.needsReview.length],
          ] as const).map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-sm font-semibold text-foreground">{value}</dd>
            </div>
          ))}
          {result.needsReview.length > 0 && (
            <ul className="col-span-full mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-status-warning">
              {result.needsReview.map((r) => <li key={r}>{r}</li>)}
            </ul>
          )}
        </dl>
      )}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Import clients from {partner.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Reads ClickUp list {listId} and brings its clients, comments, attachments and
              logins into BES. Running it again updates the same records rather than creating
              duplicates, so it is safe to repeat.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void run(); }}>
              Import
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={linking} onOpenChange={setLinking}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Link a ClickUp list to {partner.name}</AlertDialogTitle>
            <AlertDialogDescription>
              Paste the ClickUp address from your browser — open the list in ClickUp and copy the
              URL. It is stored on the partner, so imports never ask again and never match this
              partner by name.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={listInput}
            onChange={(e) => setListInput(e.target.value)}
            placeholder="https://app.clickup.com/25798251/v/li/901821115879"
            aria-label="ClickUp list address"
          />
          {listInput.trim() !== "" && (
            <p className={cn("text-xs", parsed ? "text-muted-foreground" : "text-status-danger")}>
              {parsed
                ? describeClickUpRef(parsed)
                : "That is not a ClickUp list address. Open the list in ClickUp and copy the URL from the address bar."}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={!parsed} onClick={(e) => { e.preventDefault(); void link(); }}>
              Link list
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
