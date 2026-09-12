/**
 * What BES needs from this partner, at the top of their portal.
 *
 * Dee, 2026-09-12: "Action Needed — only show this if BES needs something
 * from the Partner… If there is nothing needed: You're all caught up."
 *
 * This is the section the portal exists for. Everything else on the page is
 * reference; this is the only part that asks the partner to do something, so
 * it leads, and it disappears into a single reassuring line when there is
 * nothing to do rather than sitting there as an empty card.
 *
 * Answering moves the client on. WHICH step it moves to is a row in
 * `creditops_status_routing`, decided by BES, not by this screen and not by
 * the partner — they confirm; the workflow routes.
 */
import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/format-date";
import {
  useMyPartnerActions,
  useRespondToPartnerAction,
} from "@/lib/data/use-partner-portal-actions";

export function PortalActionNeeded() {
  const actions = useMyPartnerActions();
  const respond = useRespondToPartnerAction();
  const { toast } = useToast();
  const [answering, setAnswering] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const open = (actions.data ?? []).filter((a) => a.status === "open");

  if (actions.isLoading) {
    return (
      <section className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">Checking what needs your attention…</p>
      </section>
    );
  }

  if (open.length === 0) {
    return (
      <section className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-status-success" />
        <p className="text-sm text-foreground">You&apos;re all caught up. No action needed right now.</p>
      </section>
    );
  }

  const send = async (id: string) => {
    try {
      await respond.mutateAsync({ id, response: note });
      toast({ title: "Thank you — that is confirmed", description: "BES has been notified and the file moves on." });
      setAnswering(null);
      setNote("");
    } catch (e) {
      toast({ title: "That did not save", description: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    <section className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
      <h2 className="text-sm font-bold text-foreground">
        Action needed
        <span className="ml-2 rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
          {open.length}
        </span>
      </h2>
      <ul className="mt-3 space-y-3">
        {open.map((a) => (
          <li key={a.id} className="rounded-lg border border-border bg-card p-3">
            <p className="text-sm font-semibold text-foreground">
              {a.clientName ? `${a.clientName} — ` : ""}{a.title}
            </p>
            {a.detail && <p className="mt-0.5 text-xs text-muted-foreground">{a.detail}</p>}
            <p className="mt-1 text-[11px] text-muted-foreground">
              Requested {formatDate(a.requestedAt)}
              {a.requestedByName ? ` by ${a.requestedByName}` : ""}
            </p>

            {answering === a.id ? (
              <div className="mt-3 space-y-2">
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="Anything BES should know (optional)"
                  aria-label="Your response"
                  className="text-xs"
                />
                <div className="flex gap-2">
                  <Button size="sm" disabled={respond.isPending} onClick={() => void send(a.id)}>
                    {respond.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                    Confirm
                  </Button>
                  <Button size="sm" variant="outline" disabled={respond.isPending}
                    onClick={() => { setAnswering(null); setNote(""); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button size="sm" className="mt-3" onClick={() => { setAnswering(a.id); setNote(""); }}>
                Review
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
