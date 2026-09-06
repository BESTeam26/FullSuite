/**
 * Selected Lenders — the lenders this file is being taken to, before anyone
 * has sent anything.
 *
 * A Draft deal is a decision, not a submission. It exists because the team
 * chose to pursue that lender/program; it carries the fit and the policy
 * version as they stood at the moment of that choice. Submitting it is a
 * separate, deliberate act with its own timestamp.
 */
import { useState } from "react";
import { Loader2, Send, Trash2, Handshake } from "lucide-react";
import { errorMessage } from "@/lib/data/error-message";
import { submitSelectedDeal, unselectLender, type FundingFileDomain } from "@/lib/data/funding-domain";
import { useInvalidateFundingFile } from "@/lib/data/use-funding-domain";
import { PROGRAM_FIT_LABEL } from "@/lib/funding/readiness-engine";

interface Props {
  fileId: string;
  domain: FundingFileDomain;
  canEdit: boolean;
}

export function SelectedLendersTab({ fileId, domain, canEdit }: Props) {
  const invalidate = useInvalidateFundingFile();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selected = domain.deals.filter((d) => d.status === "Draft");

  const run = async (key: string, fn: () => Promise<void>, fallback: string) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      invalidate(fileId);
    } catch (e) {
      setError(errorMessage(e, fallback));
    } finally {
      setBusy(null);
    }
  };

  if (selected.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No lender selected yet. Choose one from Lender Search — selecting records the intention to
        pursue that program; it does not send anything.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p role="alert" className="text-xs text-status-danger">{error}</p>}
      <ul className="space-y-2">
        {selected.map((d) => (
          <li key={d.id} className="rounded-lg border border-border bg-background p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                  <Handshake className="h-3.5 w-3.5 text-primary" />
                  {d.lender}
                  {d.program && <span className="font-normal text-muted-foreground">· {d.program}</span>}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  ${d.amount.toLocaleString()} · selected, not submitted
                  {d.fitOutcome ? ` · ${PROGRAM_FIT_LABEL[d.fitOutcome]} when chosen` : ""}
                </p>
              </div>
              {canEdit && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void run(`submit:${d.id}`, () => submitSelectedDeal(d.id), "Could not submit this deal.")}
                    className="inline-flex items-center gap-1 rounded-lg border border-primary/40 px-2 py-1 text-[11px] font-bold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
                  >
                    {busy === `submit:${d.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Submit
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void run(`drop:${d.id}`, () => unselectLender(d.id), "Could not remove this selection.")}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-bold text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive disabled:opacity-60"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p className="text-[10px] text-muted-foreground">
        A selection can be removed because nothing has left the building. Once a deal is submitted the
        lender has seen the file, and it stays on the record — withdrawing it then is a decision, not a
        deletion.
      </p>
    </div>
  );
}
