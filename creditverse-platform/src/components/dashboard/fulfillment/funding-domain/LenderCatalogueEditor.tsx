/**
 * Small forms that author the lender catalogue: a capital provider, a program,
 * a policy version (criteria + strength + source + effective date), and
 * "Verify again" (a stamp, never a change of meaning). Each write is one
 * insert the policies judge; the catalogue query is invalidated after.
 */
import { useState } from "react";
import { POLICY_CHANGE_LABEL, type PolicyChangeKind } from "@/lib/data/lender-relationship";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, ShieldCheck } from "lucide-react";
import { OpsSelect } from "@/components/ui/ops-select";
import { errorMessage } from "@/lib/data/error-message";
import { createLender, createLenderProgram, createPolicyVersion, verifyPolicyVersion } from "@/lib/data/funding-domain";
import { lenderCatalogueKey } from "@/lib/data/use-funding-domain";
import type { CriterionKey, CriterionStrength } from "@/lib/funding/readiness-engine";

const inputCls = "mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:bg-muted/40 disabled:text-muted-foreground";
const labelCls = "text-[10px] font-bold uppercase tracking-wider text-muted-foreground";
const buttonCls = "inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";

const CHANGE_OPTIONS = (Object.entries(POLICY_CHANGE_LABEL) as [PolicyChangeKind, string][]).map(([value, label]) => ({ value, label }));

function useWrite() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>, fallback: string, after?: () => void) => {
    setBusy(true); setError(null);
    try { await fn(); void qc.invalidateQueries({ queryKey: lenderCatalogueKey }); after?.(); }
    catch (e) { setError(errorMessage(e, fallback)); }
    finally { setBusy(false); }
  };
  return { busy, error, run };
}

function AddLender({ organizationId, actorId }: { organizationId: string; actorId: string }) {
  const { busy, error, run } = useWrite();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", lenderKind: "funder", nmlsId: "", fdicCertificate: "", ncuaCharter: "", officialDomain: "", notes: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={buttonCls}><Plus className="h-3.5 w-3.5" /> Add capital provider</button>;
  return (
    <form className="space-y-2 rounded-xl border border-border bg-card p-4 shadow-sm" onSubmit={(e) => { e.preventDefault(); if (!f.name.trim()) return; void run(() => createLender({ organizationId, actorId, name: f.name.trim(), lenderKind: f.lenderKind, nmlsId: f.nmlsId.trim() || null, fdicCertificate: f.fdicCertificate.trim() || null, ncuaCharter: f.ncuaCharter.trim() || null, officialDomain: f.officialDomain.trim() || null, notes: f.notes.trim() || null }), "Could not add the capital provider.", () => setOpen(false)); }}>
      <p className="text-xs font-bold text-foreground">New capital provider (your organization's catalogue)</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block sm:col-span-2"><span className={labelCls}>Name</span><input value={f.name} onChange={set("name")} className={inputCls} required /></label>
        <label className="block"><span className={labelCls}>Kind</span><OpsSelect value={f.lenderKind} onValueChange={(v) => setF((x) => ({ ...x, lenderKind: v }))} options={[{ value: "funder", label: "Funder" }, { value: "bank", label: "Bank" }, { value: "credit_union", label: "Credit union" }, { value: "nonbank_lender", label: "Non-bank lender" }, { value: "network", label: "Network / marketplace" }, { value: "cdc", label: "CDC (SBA 504)" }]} aria-label="Provider kind" /></label>
        <label className="block"><span className={labelCls}>Official domain</span><input value={f.officialDomain} onChange={set("officialDomain")} placeholder="lender.com" className={inputCls} /></label>
        <label className="block"><span className={labelCls}>NMLS id</span><input value={f.nmlsId} onChange={set("nmlsId")} className={inputCls} /></label>
        <label className="block"><span className={labelCls}>FDIC certificate</span><input value={f.fdicCertificate} onChange={set("fdicCertificate")} className={inputCls} /></label>
        <label className="block"><span className={labelCls}>NCUA charter</span><input value={f.ncuaCharter} onChange={set("ncuaCharter")} className={inputCls} /></label>
        <label className="block sm:col-span-2"><span className={labelCls}>Notes</span><textarea value={f.notes} onChange={set("notes")} rows={2} className={inputCls} /></label>
      </div>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={busy} className={buttonCls}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Save provider</button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs font-semibold text-muted-foreground hover:underline">Cancel</button>
        {error && <p role="alert" className="text-xs text-status-danger">{error}</p>}
      </div>
    </form>
  );
}

function AddProgram({ lenderId }: { lenderId: string }) {
  const { busy, error, run } = useWrite();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", productFamily: "business_funding", productSubtype: "", states: "" });
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 rounded-lg border border-primary/40 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/10"><Plus className="h-3.5 w-3.5" /> Add program</button>;
  return (
    <form className="space-y-2 rounded-xl border border-border bg-card p-4 shadow-sm" onSubmit={(e) => { e.preventDefault(); if (!f.name.trim()) return; void run(() => createLenderProgram({ lenderId, name: f.name.trim(), productFamily: f.productFamily, productSubtype: f.productSubtype.trim() || null, statesAllowed: f.states.split(",").map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z]{2}$/.test(s)) }), "Could not add the program.", () => setOpen(false)); }}>
      <p className="text-xs font-bold text-foreground">New program</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block"><span className={labelCls}>Name</span><input value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} className={inputCls} required /></label>
        <label className="block"><span className={labelCls}>Product family</span><OpsSelect value={f.productFamily} onValueChange={(v) => setF((x) => ({ ...x, productFamily: v }))} options={[{ value: "business_funding", label: "Business funding (term / LOC)" }, { value: "mca", label: "MCA / revenue-based" }, { value: "sba", label: "SBA" }, { value: "equipment", label: "Equipment" }, { value: "real_estate", label: "Real estate" }, { value: "consumer", label: "Consumer" }, { value: "auto", label: "Auto" }]} aria-label="Product family" /></label>
        <label className="block"><span className={labelCls}>Subtype (optional)</span><input value={f.productSubtype} onChange={(e) => setF((x) => ({ ...x, productSubtype: e.target.value }))} className={inputCls} /></label>
        <label className="block"><span className={labelCls}>States allowed (2-letter, comma-separated; empty = not restricted)</span><input value={f.states} onChange={(e) => setF((x) => ({ ...x, states: e.target.value }))} placeholder="TX, FL, GA" className={inputCls} /></label>
      </div>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={busy} className={buttonCls}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Save program</button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs font-semibold text-muted-foreground hover:underline">Cancel</button>
        {error && <p role="alert" className="text-xs text-status-danger">{error}</p>}
      </div>
    </form>
  );
}

const CRITERIA: { key: string; label: string; strengthKey: CriterionKey; money?: boolean }[] = [
  { key: "min_amount", label: "Minimum amount ($)", strengthKey: "amount", money: true },
  { key: "max_amount", label: "Maximum amount ($)", strengthKey: "amount", money: true },
  { key: "min_credit_score", label: "Minimum credit score", strengthKey: "credit_score" },
  { key: "min_time_in_business_months", label: "Minimum time in business (months)", strengthKey: "time_in_business" },
  { key: "min_monthly_revenue", label: "Minimum monthly revenue ($)", strengthKey: "monthly_revenue", money: true },
];
const STRENGTH_OPTIONS = [{ value: "hard", label: "Hard requirement" }, { value: "preferred", label: "Preferred / guidance" }, { value: "informational", label: "Informational" }, { value: "manual_review", label: "Manual review" }];
const SOURCE_OPTIONS = [{ value: "lender_policy_sheet", label: "Lender policy sheet" }, { value: "lender_portal", label: "Lender portal" }, { value: "lender_email", label: "Lender email / BDM" }, { value: "public_program_guide", label: "Public program guide" }, { value: "internal_experience", label: "Internal experience (observed)" }];

function AddPolicyVersion({ programId, nextVersion, actorId }: { programId: string; nextVersion: number; actorId: string }) {
  const { busy, error, run } = useWrite();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [strength, setStrength] = useState<Partial<Record<CriterionKey, CriterionStrength>>>({});
  const [industries, setIndustries] = useState("");
  const [source, setSource] = useState({ type: "lender_policy_sheet", reference: "", published: "", effectiveFrom: new Date().toISOString().slice(0, 10), verifiedNow: true });
  const [change, setChange] = useState<{ kind: PolicyChangeKind; summary: string }>({ kind: "clarified", summary: "" });
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="mt-2 inline-flex items-center gap-1 rounded-lg border border-primary/40 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/10"><Plus className="h-3.5 w-3.5" /> Record policy version v{nextVersion}</button>;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const criteria: Record<string, unknown> = {};
    for (const c of CRITERIA) { const v = values[c.key]?.trim(); if (v) criteria[c.key] = Number(v); }
    const excluded = industries.split(",").map((s) => s.trim()).filter(Boolean);
    if (excluded.length) criteria.industries_excluded = excluded;
    if (Object.keys(strength).length) criteria.strength = strength;
    void run(() => createPolicyVersion({ programId, version: nextVersion, criteria, sourceType: source.type, sourceReference: source.reference.trim() || null, sourcePublishedDate: source.published || null, effectiveFrom: source.effectiveFrom, verifiedNow: source.verifiedNow, actorId, change: nextVersion > 1 && change.summary.trim() ? { fromVersion: nextVersion - 1, kind: change.kind, summary: change.summary.trim() } : null }), "Could not record the policy version.", () => setOpen(false));
  };
  return (
    <form className="mt-2 space-y-3 rounded-xl border border-border bg-background p-4" onSubmit={submit}>
      <p className="text-xs font-bold text-foreground">Policy version v{nextVersion} — what the lender states, with its source. A criterion left blank is not stored.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {CRITERIA.map((c) => (
          <div key={c.key} className="grid grid-cols-[1.4fr_1fr] gap-2">
            <label className="block"><span className={labelCls}>{c.label}</span><input type="number" inputMode="decimal" value={values[c.key] ?? ""} onChange={(e) => setValues((x) => ({ ...x, [c.key]: e.target.value }))} className={inputCls} /></label>
            <label className="block"><span className={labelCls}>Strength</span><OpsSelect value={strength[c.strengthKey] ?? "hard"} onValueChange={(v) => setStrength((x) => ({ ...x, [c.strengthKey]: v as CriterionStrength }))} options={STRENGTH_OPTIONS} aria-label={`${c.label} strength`} /></label>
          </div>
        ))}
        <label className="block sm:col-span-2"><span className={labelCls}>Industries excluded (comma-separated)</span><input value={industries} onChange={(e) => setIndustries(e.target.value)} placeholder="cannabis, adult entertainment" className={inputCls} /></label>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block"><span className={labelCls}>Source type</span><OpsSelect value={source.type} onValueChange={(v) => setSource((s) => ({ ...s, type: v }))} options={SOURCE_OPTIONS} aria-label="Source type" /></label>
        <label className="block"><span className={labelCls}>Source reference</span><input value={source.reference} onChange={(e) => setSource((s) => ({ ...s, reference: e.target.value }))} placeholder="Program guide 2026-Q3, BDM email 2026-08-24" className={inputCls} /></label>
        <label className="block"><span className={labelCls}>Source published (yyyy-mm-dd)</span><input type="date" value={source.published} onChange={(e) => setSource((s) => ({ ...s, published: e.target.value }))} className={inputCls} /></label>
        <label className="block"><span className={labelCls}>Effective from</span><input type="date" value={source.effectiveFrom} onChange={(e) => setSource((s) => ({ ...s, effectiveFrom: e.target.value }))} className={inputCls} required /></label>
        {nextVersion > 1 && (
          <>
            <label className="block"><span className={labelCls}>What changed since v{nextVersion - 1}</span><OpsSelect value={change.kind} onValueChange={(v) => setChange((c) => ({ ...c, kind: v as PolicyChangeKind }))} options={CHANGE_OPTIONS} aria-label="Change kind" /></label>
            <label className="block"><span className={labelCls}>Summary (feeds the policy-update feed; blank = no feed row)</span><input value={change.summary} onChange={(e) => setChange((c) => ({ ...c, summary: e.target.value }))} placeholder="Minimum credit score raised from 600 to 640" className={inputCls} /></label>
          </>
        )}
        <label className="flex items-center gap-2 text-xs text-foreground sm:col-span-2"><input type="checkbox" checked={source.verifiedNow} onChange={(e) => setSource((s) => ({ ...s, verifiedNow: e.target.checked }))} className="h-3.5 w-3.5 rounded border-border" /> I confirmed these criteria with the lender today (sets the verification stamp; unverified policies cannot produce a fit)</label>
      </div>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={busy} className={buttonCls}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Record v{nextVersion}</button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs font-semibold text-muted-foreground hover:underline">Cancel</button>
        {error && <p role="alert" className="text-xs text-status-danger">{error}</p>}
      </div>
    </form>
  );
}

function VerifyAgain({ programId, version, actorId }: { programId: string; version: number; actorId: string }) {
  const { busy, error, run } = useWrite();
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <button type="button" disabled={busy} onClick={() => void run(() => verifyPolicyVersion(programId, version, actorId), "Could not record the verification.")}
        className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-bold text-foreground hover:bg-muted disabled:opacity-60">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />} Verified with the lender today
      </button>
      {error && <p role="alert" className="text-[11px] text-status-danger">{error}</p>}
    </div>
  );
}

export const LenderCatalogueEditor = { AddLender, AddProgram, AddPolicyVersion, VerifyAgain };
