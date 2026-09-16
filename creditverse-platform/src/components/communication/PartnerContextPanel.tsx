/**
 * Column 4 — who you are talking to.
 *
 * Dee, 2026-09-16: *"For Partner conversations, support an optional right
 * context panel … This is context, not authorization."*
 *
 * Both halves live in `partner_conversation_context`, not here: it refuses
 * unless the caller is BES staff who may already see that partner, and it
 * returns the balance as NULL unless they hold `partners.invoices.view`. This
 * file draws the answer and, where money was withheld, says so honestly rather
 * than printing a zero somebody might act on.
 */
import { Building2, ExternalLink, X } from "lucide-react";
import { Link } from "react-router-dom";
import { formatMoneyIn } from "@/lib/format-money";
import { PanelState } from "@/components/common/QueryState";
import { usePartnerContext } from "@/lib/data/use-partner-context";


const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="border-b border-border/60 px-3 py-2 last:border-b-0">
    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
    <div className="mt-0.5 text-sm text-foreground">{children}</div>
  </div>
);

export function PartnerContextPanel({
  groupId, partnerId, onClose,
}: {
  groupId: string;
  /** For the deep links — the partner's own record. */
  partnerId: string;
  onClose: () => void;
}) {
  const ctx = usePartnerContext(groupId);

  return (
    <aside aria-label="Partner details"
      className="flex w-full shrink-0 flex-col rounded-xl border border-border bg-card md:w-64">
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <Building2 className="h-3.5 w-3.5" /> Partner
        </h2>
        <button type="button" onClick={onClose} aria-label="Close partner details"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {ctx.isPending || ctx.isError || !ctx.data ? (
          <div className="p-3">
            <PanelState query={ctx} empty={
              <p className="text-xs text-muted-foreground">
                No partner details to show for this conversation.
              </p>} />
          </div>
        ) : (
          <>
            <Row label="Partner">
              <span className="font-semibold">{ctx.data.partnerName}</span>
              {ctx.data.lifecycle && (
                <span className="ml-1.5 text-[11px] text-muted-foreground">{ctx.data.lifecycle}</span>
              )}
            </Row>
            {ctx.data.primaryContact && <Row label="Primary contact">{ctx.data.primaryContact}</Row>}
            <Row label="Services">
              {ctx.data.services.length === 0
                ? <span className="text-xs text-muted-foreground">None active</span>
                : <ul className="space-y-0.5 text-xs">
                    {ctx.data.services.map((s) => <li key={s}>{s}</li>)}
                  </ul>}
            </Row>
            <Row label="Assigned BES team">
              {ctx.data.assignedTeam.length === 0
                ? <span className="text-xs text-muted-foreground">Nobody assigned</span>
                : <ul className="space-y-0.5 text-xs">
                    {ctx.data.assignedTeam.map((p) => <li key={p}>{p}</li>)}
                  </ul>}
            </Row>
            <Row label="Open actions"><span className="tabular-nums">{ctx.data.openActions}</span></Row>
            <Row label="Clients"><span className="tabular-nums">{ctx.data.activeClients}</span></Row>
            <Row label="Outstanding">
              {/* Withheld is not zero. Dee's own rule: show "Not available"
                  rather than a figure nobody established. */}
              {ctx.data.balanceVisible
                ? <span className="tabular-nums">{formatMoneyIn((ctx.data.balanceCents ?? 0) / 100, "USD")}</span>
                : <span className="text-xs text-muted-foreground">Not available to you</span>}
            </Row>
            <div className="p-3">
              <Link to={`/app/bes-partners/${partnerId}`}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                View partner <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
