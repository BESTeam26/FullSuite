/**
 * Offers: raw lender terms exactly as recorded, the values FundingOS
 * calculates from them labelled as calculated, and the offer's state machine
 * (internal review → ready to present → presented → client decision).
 * Accepting an offer moves the file to Offer Accepted; it funds nothing.
 */
import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { OpsSelect } from "@/components/ui/ops-select";
import { useAuth } from "@/lib/auth/auth-context";
import { errorMessage } from "@/lib/data/error-message";
import { createOffer, setOfferStatus, type FundingFileDomain, type Offer, type OfferStatus, type PricingType } from "@/lib/data/funding-domain";
import { useInvalidateFundingFile } from "@/lib/data/use-funding-domain";
import { formatDate } from "@/lib/format-date";
import { PRICING_LABEL, calculateOffer, formatPricing } from "@/lib/funding/offer-math";
import { cn } from "@/lib/utils";

interface Props { fileId: string; domain: FundingFileDomain; canEdit: boolean }

const STATUS_LABEL: Record<OfferStatus, string> = {
  received: "Received", internal_review: "Internal review", ready_to_present: "Ready to present", presented: "Presented to client",
  client_considering: "Client considering", client_accepted: "Client accepted", client_declined: "Client declined", expired: "Expired", withdrawn: "Withdrawn",
};
const NEXT: Record<OfferStatus, OfferStatus[]> = {
  received: ["internal_review", "withdrawn", "expired"], internal_review: ["ready_to_present", "withdrawn", "expired"], ready_to_present: ["presented", "internal_review", "withdrawn", "expired"],
  presented: ["client_considering", "client_accepted", "client_declined", "expired", "withdrawn"], client_considering: ["client_accepted", "client_declined", "expired", "withdrawn"],
  client_accepted: [], client_declined: [], expired: [], withdrawn: [],
};
const input = "mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary";
const label = "text-[10px] font-bold uppercase tracking-wider text-muted-foreground";
const money = (v: number | null) => (v === null ? "Not provided" : `$${v.toLocaleString()}`);

export function OffersTab({ fileId, domain, canEdit }: Props) {
  const auth = useAuth();
  const invalidate = useInvalidateFundingFile();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ dealId: domain.deals[0]?.id ?? "", offerAmount: "", pricingType: "factor_rate" as PricingType, pricingValue: "", termText: "", paymentFrequency: "daily", paymentAmount: "", originationFee: "", prepaymentTerms: "", expiresAt: "", note: "" });
  const run = async (key: string, fn: () => Promise<unknown>, fallback: string) => {
    setBusy(key); setError(null);
    try { await fn(); invalidate(fileId); } catch (e) { setError(errorMessage(e, fallback)); } finally { setBusy(null); }
  };
  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  const record = () => {
    if (!auth.user || !f.dealId) return;
    const deal = domain.deals.find((d) => d.id === f.dealId);
    void run("record", () => createOffer({
      fileId, dealId: f.dealId, lenderId: deal?.lenderId ?? null, offerAmount: num(f.offerAmount), pricingType: f.pricingType, pricingValue: num(f.pricingValue), termText: f.termText.trim() || null,
      paymentFrequency: f.paymentFrequency || null, paymentAmount: num(f.paymentAmount), originationFee: num(f.originationFee), prepaymentTerms: f.prepaymentTerms.trim() || null,
      expiresAt: f.expiresAt ? new Date(f.expiresAt).toISOString() : null, note: f.note.trim() || null, actorId: auth.user.id,
    }), "Could not record the offer.").then(() => setOpen(false));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">Raw terms are shown as the lender stated them; calculated values are labelled. A factor rate is never an APR. Missing terms read "Not provided".</p>
        {canEdit && domain.deals.length > 0 && <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90"><Plus className="h-3.5 w-3.5" /> Record offer</button>}
      </div>
      {domain.deals.length === 0 && <p className="text-xs text-muted-foreground">An offer belongs to a submission. Submit to a lender first (Matches &amp; Submissions).</p>}

      {open && (
        <div className="space-y-2 rounded-lg border border-border bg-background p-3">
          <p className="text-xs font-bold text-foreground">Lender's terms, exactly as provided</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="block sm:col-span-3"><span className={label}>Submission</span><OpsSelect value={f.dealId} onValueChange={(v) => setF((x) => ({ ...x, dealId: v }))} options={domain.deals.map((d) => ({ value: d.id, label: `${d.lender}${d.program ? ` · ${d.program}` : ""} · $${d.amount.toLocaleString()}` }))} aria-label="Submission" /></label>
            <label className="block"><span className={label}>Offer amount ($)</span><input type="number" value={f.offerAmount} onChange={(e) => setF((x) => ({ ...x, offerAmount: e.target.value }))} className={input} /></label>
            <label className="block"><span className={label}>Pricing type</span><OpsSelect value={f.pricingType} onValueChange={(v) => setF((x) => ({ ...x, pricingType: v as PricingType }))} options={(Object.keys(PRICING_LABEL) as PricingType[]).map((k) => ({ value: k, label: PRICING_LABEL[k] }))} aria-label="Pricing type" /></label>
            <label className="block"><span className={label}>Pricing value ({f.pricingType === "factor_rate" ? "e.g. 1.24" : f.pricingType === "fee_based" ? "$" : "%"})</span><input type="number" step="0.0001" value={f.pricingValue} onChange={(e) => setF((x) => ({ ...x, pricingValue: e.target.value }))} disabled={f.pricingType === "not_provided"} className={input} /></label>
            <label className="block"><span className={label}>Term (as stated)</span><input value={f.termText} onChange={(e) => setF((x) => ({ ...x, termText: e.target.value }))} placeholder="12 months · 180 daily payments" className={input} /></label>
            <label className="block"><span className={label}>Payment frequency</span><OpsSelect value={f.paymentFrequency} onValueChange={(v) => setF((x) => ({ ...x, paymentFrequency: v }))} options={[{ value: "daily", label: "Daily" }, { value: "weekly", label: "Weekly" }, { value: "bi-weekly", label: "Bi-weekly" }, { value: "monthly", label: "Monthly" }, { value: "", label: "Not provided" }]} aria-label="Payment frequency" /></label>
            <label className="block"><span className={label}>Payment amount ($)</span><input type="number" value={f.paymentAmount} onChange={(e) => setF((x) => ({ ...x, paymentAmount: e.target.value }))} className={input} /></label>
            <label className="block"><span className={label}>Origination fee ($)</span><input type="number" value={f.originationFee} onChange={(e) => setF((x) => ({ ...x, originationFee: e.target.value }))} className={input} /></label>
            <label className="block"><span className={label}>Prepayment terms</span><input value={f.prepaymentTerms} onChange={(e) => setF((x) => ({ ...x, prepaymentTerms: e.target.value }))} className={input} /></label>
            <label className="block"><span className={label}>Expires</span><input type="date" value={f.expiresAt} onChange={(e) => setF((x) => ({ ...x, expiresAt: e.target.value }))} className={input} /></label>
            <label className="block sm:col-span-3"><span className={label}>Note</span><input value={f.note} onChange={(e) => setF((x) => ({ ...x, note: e.target.value }))} className={input} /></label>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={record} disabled={busy === "record" || !f.dealId} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-60">{busy === "record" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Save offer</button>
            <button type="button" onClick={() => setOpen(false)} className="text-xs font-semibold text-muted-foreground hover:underline">Cancel</button>
          </div>
        </div>
      )}

      {domain.offers.length === 0 ? <p className="text-xs text-muted-foreground">No offers recorded.</p> : (
        <ul className="space-y-2">
          {domain.offers.map((o) => <OfferCard key={o.id} offer={o} deal={domain.deals.find((d) => d.id === o.dealId)} canEdit={canEdit} busy={busy} onStatus={(s) => run(`status:${o.id}`, () => setOfferStatus(o.id, s), "Could not change the offer status.")} />)}
        </ul>
      )}
      {error && <p role="alert" className="text-xs text-status-danger">{error}</p>}
    </div>
  );
}

function OfferCard({ offer, deal, canEdit, busy, onStatus }: { offer: Offer; deal?: { lender: string; program: string | null }; canEdit: boolean; busy: string | null; onStatus: (s: OfferStatus) => Promise<void> }) {
  const calc = calculateOffer({ offerAmount: offer.offerAmount, pricingType: offer.pricingType, pricingValue: offer.pricingValue, paymentAmount: offer.paymentAmount, paymentFrequency: offer.paymentFrequency, termText: offer.termText, originationFee: offer.originationFee, otherFees: offer.otherFees });
  const next = NEXT[offer.status];
  return (
    <li className="rounded-lg border border-border bg-background p-3 text-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-foreground">{deal?.lender ?? "Lender"}{deal?.program && <span className="text-muted-foreground"> · {deal.program}</span>}</p>
          <p className="text-[10px] text-muted-foreground">received {formatDate(offer.receivedAt)}{offer.expiresAt && ` · expires ${formatDate(offer.expiresAt)}`}{offer.presentedAt && ` · presented ${formatDate(offer.presentedAt)}`}</p>
        </div>
        <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold", offer.status === "client_accepted" ? "border-emerald-500/40 bg-emerald-500/10 text-status-success" : offer.status === "client_declined" || offer.status === "expired" || offer.status === "withdrawn" ? "border-border bg-muted text-muted-foreground" : "border-blue-500/40 bg-blue-500/10 text-blue-800")}>{STATUS_LABEL[offer.status]}</span>
      </div>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border/60 bg-card p-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Lender-provided</p>
          <dl className="mt-1 space-y-0.5 text-[11px]">
            <div className="flex justify-between"><dt className="text-muted-foreground">Offer amount</dt><dd className="font-semibold text-foreground">{money(offer.offerAmount)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">{PRICING_LABEL[offer.pricingType]}</dt><dd className="font-semibold text-foreground">{formatPricing(offer.pricingType, offer.pricingValue)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Term</dt><dd className="text-foreground">{offer.termText ?? "Not provided"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Payment</dt><dd className="text-foreground">{money(offer.paymentAmount)}{offer.paymentFrequency && ` ${offer.paymentFrequency}`}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Origination fee</dt><dd className="text-foreground">{money(offer.originationFee)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Prepayment</dt><dd className="text-foreground">{offer.prepaymentTerms ?? "Not provided"}</dd></div>
          </dl>
        </div>
        <div className="rounded-lg border border-border/60 bg-card p-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Calculated by the platform</p>
          <dl className="mt-1 space-y-0.5 text-[11px]">
            <div className="flex justify-between"><dt className="text-muted-foreground">Total payback</dt><dd className="font-semibold text-foreground">{calc.totalPayback === null ? "Not calculated" : `$${calc.totalPayback.toLocaleString()}`}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Estimated financing cost</dt><dd className="text-foreground">{calc.estimatedFinancingCost === null ? "Not calculated" : `$${calc.estimatedFinancingCost.toLocaleString()}`}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Net proceeds</dt><dd className="text-foreground">{calc.netProceeds === null ? "Not calculated" : `$${calc.netProceeds.toLocaleString()}`}</dd></div>
          </dl>
          {calc.notes.map((nte) => <p key={nte} className="mt-1 text-[10px] text-muted-foreground">{nte}</p>)}
        </div>
      </div>
      {canEdit && next.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {next.map((s) => (
            <button key={s} type="button" disabled={busy !== null} onClick={() => void onStatus(s)}
              className={cn("rounded-lg border px-2 py-1 text-[11px] font-bold disabled:opacity-60", s === "client_accepted" ? "border-emerald-500/40 text-status-success hover:bg-emerald-500/10" : s === "client_declined" || s === "withdrawn" || s === "expired" ? "border-border text-muted-foreground hover:bg-muted" : "border-primary/40 text-primary hover:bg-primary/10")}>
              {busy === `status:${offer.id}` ? <Loader2 className="inline h-3 w-3 animate-spin" /> : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      )}
      {offer.note && <p className="mt-1 text-[11px] text-muted-foreground">{offer.note}</p>}
    </li>
  );
}
