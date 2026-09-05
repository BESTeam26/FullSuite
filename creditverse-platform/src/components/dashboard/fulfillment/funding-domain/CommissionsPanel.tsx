/**
 * Commissions on a funded deal: who is owed what, on which basis, and the
 * state (pending → approved → paid, or void). The amount is computed by
 * lib/funding/commission-math.ts from the funded gross — never typed as a
 * conclusion. Reviewers write (policy); the "View commissions" permission
 * decides who is offered the panel at all.
 */
import { useMemo, useState } from "react";
import { BadgeDollarSign, Loader2, Plus } from "lucide-react";
import { OpsSelect } from "@/components/ui/ops-select";
import { errorMessage } from "@/lib/data/error-message";
import { createCommission, setCommissionState, type FileCommission, type FundedDeal } from "@/lib/data/funding-domain";
import { useInvalidateFundingFile } from "@/lib/data/use-funding-domain";
import { useOrgMembers } from "@/lib/data/use-workspaces";
import { formatDate } from "@/lib/format-date";
import { formatMoney } from "@/lib/format-money";
import { COMMISSION_STATE_LABEL, PARTY_KIND_LABEL, computeCommission, nextCommissionStates, type CommissionBasis, type CommissionPartyKind, type CommissionState } from "@/lib/funding/commission-math";
import { cn } from "@/lib/utils";

const STATE_TONE: Record<CommissionState, string> = { pending: "border-amber-500/40 bg-amber-500/10 text-amber-800", approved: "border-blue-500/30 bg-blue-500/10 text-blue-700", paid: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700", void: "border-border bg-muted text-muted-foreground" };
const inputCls = "w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary";
const labelCls = "mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground";

export function CommissionsPanel({ fileId, organizationId, funded, commissions, canEdit, actorId }: { fileId: string; organizationId: string | null; funded: FundedDeal[]; commissions: FileCommission[]; canEdit: boolean; actorId: string | null }) {
  const invalidate = useInvalidateFundingFile();
  const { members } = useOrgMembers(organizationId);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState<{ dealId: string; partyKind: CommissionPartyKind; partyId: string; basis: CommissionBasis; rate: string; note: string }>({ dealId: funded[0]?.dealId ?? "", partyKind: "org_user", partyId: "", basis: "pct", rate: "", note: "" });
  const deal = funded.find((d) => d.dealId === f.dealId) ?? funded[0];
  const preview = deal ? computeCommission(f.basis, Number(f.rate), deal.grossFunded) : 0;
  const memberName = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m.name])), [members]);
  if (funded.length === 0) return null;

  const run = async (key: string, fn: () => Promise<void>, fallback: string) => {
    setBusy(key); setError(null);
    try { await fn(); invalidate(fileId); } catch (e) { setError(errorMessage(e, fallback)); } finally { setBusy(null); }
  };
  const submit = () => {
    if (!deal || !actorId || !f.rate || (f.partyKind !== "agency" && !f.partyId)) { setError("Choose the party and enter the rate or amount."); return; }
    void run("add", () => createCommission({ dealId: deal.dealId, partyKind: f.partyKind, partyId: f.partyKind === "agency" ? organizationId ?? actorId : f.partyId, basis: f.basis, rateOrAmount: Number(f.rate), computedAmount: preview, fundedAt: deal.fundedAt, note: f.note.trim() || null, actorId }), "Could not record the commission.")
      .then(() => { setAdding(false); setF((x) => ({ ...x, partyId: "", rate: "", note: "" })); });
  };

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground"><BadgeDollarSign className="h-3.5 w-3.5 text-primary" /> Commissions</p>
        {canEdit && actorId && !adding && <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 rounded-lg border border-primary/40 px-2 py-1 text-[11px] font-bold text-primary hover:bg-primary/10"><Plus className="h-3.5 w-3.5" /> Record commission</button>}
      </div>
      {commissions.length === 0 && !adding && <p className="mt-1 text-xs text-muted-foreground">No commissions recorded on this file's funded deals.</p>}
      <ul className="mt-2 divide-y divide-border/60">
        {commissions.map((c) => {
          const nexts = nextCommissionStates(c.state);
          return (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
              <div className="min-w-0">
                <p className="font-semibold text-foreground">{PARTY_KIND_LABEL[c.partyKind]}{c.partyKind === "org_user" && memberName[c.partyId] ? ` · ${memberName[c.partyId]}` : ""} · {formatMoney(c.computedAmount)}</p>
                <p className="text-[11px] text-muted-foreground">{c.basis === "pct" ? `${c.rateOrAmount}% of gross funded` : `Flat ${formatMoney(c.rateOrAmount)}`}{c.note && ` · ${c.note}`}{c.paidAt && ` · paid ${formatDate(c.paidAt)}`}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold", STATE_TONE[c.state])}>{COMMISSION_STATE_LABEL[c.state]}</span>
                {canEdit && nexts.map((n) => (
                  <button key={n} type="button" disabled={busy !== null} onClick={() => void run(`${c.id}:${n}`, () => setCommissionState(c.id, n), "Could not change the commission state.")} className="rounded-lg border border-border px-2 py-0.5 text-[11px] font-semibold text-foreground hover:bg-muted disabled:opacity-60">
                    {busy === `${c.id}:${n}` ? <Loader2 className="inline h-3 w-3 animate-spin" /> : `Mark ${COMMISSION_STATE_LABEL[n].toLowerCase()}`}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>

      {adding && (
        <form className="mt-2 grid gap-2 rounded-lg border border-border bg-background p-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          {funded.length > 1 && <label className="block sm:col-span-2"><span className={labelCls}>Funded deal</span><OpsSelect value={f.dealId} onValueChange={(v) => setF((x) => ({ ...x, dealId: v }))} options={funded.map((d) => ({ value: d.dealId, label: `${d.lenderName} · ${formatMoney(d.grossFunded)} · ${formatDate(d.fundedAt)}` }))} aria-label="Funded deal" /></label>}
          <label className="block"><span className={labelCls}>Party</span><OpsSelect value={f.partyKind} onValueChange={(v) => setF((x) => ({ ...x, partyKind: v as CommissionPartyKind, partyId: "" }))} options={(Object.entries(PARTY_KIND_LABEL) as [CommissionPartyKind, string][]).map(([value, label]) => ({ value, label }))} aria-label="Party kind" /></label>
          {f.partyKind === "org_user" && <label className="block"><span className={labelCls}>Team member</span><OpsSelect value={f.partyId} onValueChange={(v) => setF((x) => ({ ...x, partyId: v }))} options={members.map((m) => ({ value: m.id, label: m.name }))} placeholder="Choose…" aria-label="Team member" /></label>}
          {(f.partyKind === "partner" || f.partyKind === "lender_referral") && <label className="block"><span className={labelCls}>Party reference id</span><input value={f.partyId} onChange={(e) => setF((x) => ({ ...x, partyId: e.target.value }))} placeholder="External membership id" className={inputCls} /></label>}
          <label className="block"><span className={labelCls}>Basis</span><OpsSelect value={f.basis} onValueChange={(v) => setF((x) => ({ ...x, basis: v as CommissionBasis }))} options={[{ value: "pct", label: "% of gross funded" }, { value: "flat", label: "Flat amount" }]} aria-label="Basis" /></label>
          <label className="block"><span className={labelCls}>{f.basis === "pct" ? "Rate (%)" : "Amount ($)"}</span><input type="number" inputMode="decimal" min="0" step="0.01" value={f.rate} onChange={(e) => setF((x) => ({ ...x, rate: e.target.value }))} className={inputCls} required /></label>
          <label className="block sm:col-span-2"><span className={labelCls}>Note</span><input value={f.note} onChange={(e) => setF((x) => ({ ...x, note: e.target.value }))} className={inputCls} /></label>
          <p className="text-xs text-foreground sm:col-span-2">Computed: <span className="font-bold">{formatMoney(preview)}</span> {deal && <span className="text-muted-foreground">on {formatMoney(deal.grossFunded)} gross funded</span>}</p>
          <div className="flex items-center gap-2 sm:col-span-2">
            <button type="submit" disabled={busy !== null} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">{busy === "add" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Save</button>
            <button type="button" onClick={() => setAdding(false)} className="text-xs font-semibold text-muted-foreground hover:underline">Cancel</button>
          </div>
        </form>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-status-danger">{error}</p>}
    </div>
  );
}
