/**
 * Closing and funding confirmation. Every step is an explicit human action:
 * Start Closing (accepted offer only) → requirements → signatures → Funding
 * Pending → Confirm Funding, the ONLY action that creates a funded deal, with
 * gross, net and the funding date. Requested, accepted, gross and net stay
 * separate and any difference is shown, never smoothed over.
 */
import { useState } from "react";
import { BadgeCheck, Loader2 } from "lucide-react";
import { errorMessage } from "@/lib/data/error-message";
import { advanceClosing, confirmFunding, startClosing, type ClosingStatus, type FundingFileDomain } from "@/lib/data/funding-domain";
import { useInvalidateFundingFile } from "@/lib/data/use-funding-domain";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { CommissionsPanel } from "@/components/dashboard/fulfillment/funding-domain/CommissionsPanel";

interface Props { fileId: string; domain: FundingFileDomain; organizationId?: string | null; actorId?: string | null; canCommission?: boolean; canEdit: boolean; /** fundingops.funding.confirm — confirming creates the funded deal; defaults to canEdit. */ canConfirm?: boolean }

const CLOSING_LABEL: Record<ClosingStatus, string> = {
  started: "Started", requirements_outstanding: "Closing requirements outstanding", awaiting_signatures: "Awaiting signatures", signed: "Signed / completed",
  funding_pending: "Funding pending", funded: "Funded", cancelled: "Cancelled",
};
const NEXT: Record<ClosingStatus, ClosingStatus[]> = {
  started: ["requirements_outstanding", "awaiting_signatures", "cancelled"], requirements_outstanding: ["awaiting_signatures", "cancelled"], awaiting_signatures: ["signed", "requirements_outstanding", "cancelled"],
  signed: ["funding_pending", "cancelled"], funding_pending: ["cancelled"], funded: [], cancelled: [],
};
const input = "mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary";
const label = "text-[10px] font-bold uppercase tracking-wider text-muted-foreground";
const money = (v: number | null) => (v === null ? "—" : `$${v.toLocaleString()}`);

export function ClosingTab({ fileId, domain, organizationId = null, actorId = null, canCommission = false, canEdit, canConfirm = canEdit }: Props) {
  const invalidate = useInvalidateFundingFile();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fund, setFund] = useState({ gross: "", net: "", fundedAt: new Date().toISOString().slice(0, 10), reference: "", note: "" });
  const run = async (key: string, fn: () => Promise<unknown>, fallback: string) => {
    setBusy(key); setError(null);
    try { await fn(); invalidate(fileId); } catch (e) { setError(errorMessage(e, fallback)); } finally { setBusy(null); }
  };

  const openClosing = domain.closings.find((c) => c.status !== "funded" && c.status !== "cancelled") ?? null;
  const acceptedOffers = domain.offers.filter((o) => o.status === "client_accepted" && !domain.closings.some((c) => c.offerId === o.id && c.status !== "cancelled"));
  const offerFor = (id: string) => domain.offers.find((o) => o.id === id);

  return (
    <div className="space-y-3">
      {!openClosing && acceptedOffers.length === 0 && domain.fundedDeals.length === 0 && (
        <p className="text-xs text-muted-foreground">Closing starts from an accepted offer. Accept an offer on the Offers tab first.</p>
      )}
      {canEdit && !openClosing && acceptedOffers.map((o) => (
        <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3 text-xs">
          <p className="text-foreground">Accepted offer · {money(o.offerAmount)}{o.termText && ` · ${o.termText}`}. <span className="text-muted-foreground">Accepted is not funded.</span></p>
          <button type="button" disabled={busy !== null} onClick={() => void run(`start:${o.id}`, () => startClosing(o.id), "Could not start closing.")} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-60">
            {busy === `start:${o.id}` ? <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> : "Start closing"}
          </button>
        </div>
      ))}

      {openClosing && (
        <div className="rounded-lg border border-border bg-background p-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold text-foreground">Closing · {CLOSING_LABEL[openClosing.status]}</p>
            <p className="text-[10px] text-muted-foreground">started {formatDate(openClosing.startedAt)}{openClosing.signedAt && ` · signed ${formatDate(openClosing.signedAt)}`}</p>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Offer accepted: {money(offerFor(openClosing.offerId)?.offerAmount ?? null)}. Closing stipulations are document requests on the Documents tab.</p>
          {canEdit && NEXT[openClosing.status].length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {NEXT[openClosing.status].map((s) => (
                <button key={s} type="button" disabled={busy !== null} onClick={() => void run(`adv:${s}`, () => advanceClosing(openClosing.id, s), "Could not advance the closing.")}
                  className={cn("rounded-lg border px-2 py-1 text-[11px] font-bold disabled:opacity-60", s === "cancelled" ? "border-border text-muted-foreground hover:bg-muted" : "border-primary/40 text-primary hover:bg-primary/10")}>
                  {busy === `adv:${s}` ? <Loader2 className="inline h-3 w-3 animate-spin" /> : CLOSING_LABEL[s]}
                </button>
              ))}
            </div>
          )}
          {canEdit && !canConfirm && openClosing.status === "funding_pending" && <p className="text-[11px] text-muted-foreground">Confirming funding needs the "Confirm funding" permission — an admin or a member granted it.</p>}
          {canConfirm && openClosing.status === "funding_pending" && (
            <div className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">Confirm funding — the only action that creates a funded deal</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-4">
                <label className="block"><span className={label}>Gross funded ($)</span><input type="number" value={fund.gross} onChange={(e) => setFund((x) => ({ ...x, gross: e.target.value }))} className={input} /></label>
                <label className="block"><span className={label}>Net funded ($)</span><input type="number" value={fund.net} onChange={(e) => setFund((x) => ({ ...x, net: e.target.value }))} className={input} /></label>
                <label className="block"><span className={label}>Funding date</span><input type="date" value={fund.fundedAt} onChange={(e) => setFund((x) => ({ ...x, fundedAt: e.target.value }))} className={input} /></label>
                <label className="block"><span className={label}>Disbursement reference</span><input value={fund.reference} onChange={(e) => setFund((x) => ({ ...x, reference: e.target.value }))} className={input} /></label>
              </div>
              {fund.gross && offerFor(openClosing.offerId)?.offerAmount !== null && offerFor(openClosing.offerId)?.offerAmount !== undefined && Number(fund.gross) !== offerFor(openClosing.offerId)!.offerAmount && (
                <p className="mt-2 text-[11px] font-semibold text-amber-800">Accepted {money(offerFor(openClosing.offerId)!.offerAmount)} · actual gross {money(Number(fund.gross))} · difference {money(Number(fund.gross) - offerFor(openClosing.offerId)!.offerAmount!)}</p>
              )}
              <button type="button" disabled={busy !== null || !fund.gross || !fund.net || !fund.fundedAt || Number(fund.net) > Number(fund.gross)}
                onClick={() => void run("confirm", () => confirmFunding({ closingId: openClosing.id, gross: Number(fund.gross), net: Number(fund.net), fundedAt: new Date(fund.fundedAt).toISOString(), reference: fund.reference.trim() || undefined, note: fund.note.trim() || undefined }), "The database refused the funding confirmation.")}
                className="mt-2 inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60">
                {busy === "confirm" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BadgeCheck className="h-3.5 w-3.5" />} Confirm funding
              </button>
            </div>
          )}
        </div>
      )}

      {domain.fundedDeals.length > 0 && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Funded deals (immutable)</p>
          <ul className="mt-1 space-y-2">
            {domain.fundedDeals.map((d) => {
              const diff = d.acceptedOfferAmount === null ? null : d.grossFunded - d.acceptedOfferAmount;
              return (
                <li key={d.id} className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3 text-xs">
                  <p className="text-sm font-bold text-foreground">{d.lenderName} · funded {formatDate(d.fundedAt)}{d.disbursementReference && <span className="font-mono text-[10px] text-muted-foreground"> · {d.disbursementReference}</span>}</p>
                  <dl className="mt-1 grid gap-1 sm:grid-cols-4 text-[11px]">
                    <div><dt className="text-muted-foreground">Requested</dt><dd className="font-semibold text-foreground">{money(d.requestedAmount)}</dd></div>
                    <div><dt className="text-muted-foreground">Accepted offer</dt><dd className="font-semibold text-foreground">{money(d.acceptedOfferAmount)}</dd></div>
                    <div><dt className="text-muted-foreground">Actual gross</dt><dd className="font-semibold text-foreground">{money(d.grossFunded)}</dd></div>
                    <div><dt className="text-muted-foreground">Net funded</dt><dd className="font-semibold text-foreground">{money(d.netFunded)}</dd></div>
                  </dl>
                  {diff !== null && diff !== 0 && <p className="mt-1 text-[11px] font-semibold text-amber-800">Difference between accepted and actual gross: {diff > 0 ? "+" : "−"}{money(Math.abs(diff))}</p>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {canCommission && <CommissionsPanel fileId={fileId} organizationId={organizationId} funded={domain.fundedDeals} commissions={domain.commissions} canEdit={canEdit} actorId={actorId} />}
      {error && <p role="alert" className="text-xs text-status-danger">{error}</p>}
      <p className="text-[10px] text-muted-foreground">Accepted offer ≠ funded. Signed documents ≠ funded. Only a confirmed disbursement creates a funded deal.</p>
    </div>
  );
}
