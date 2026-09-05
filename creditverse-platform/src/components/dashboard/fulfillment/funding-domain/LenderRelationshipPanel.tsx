/**
 * Relationship intelligence for one lender: partner status, last contact,
 * named contacts with a verification stamp. Facts an operator recorded —
 * never a score, never a ranking (Dee's design: data confidence, not scores).
 */
import { useState } from "react";
import { Loader2, Plus, ShieldCheck } from "lucide-react";
import { OpsSelect } from "@/components/ui/ops-select";
import { errorMessage } from "@/lib/data/error-message";
import { addLenderContact, logLenderContact, PARTNER_STATUS_LABEL, setPartnerStatus, verifyLenderContact, type PartnerStatus } from "@/lib/data/lender-relationship";
import { useInvalidateLender, useLenderRelationship } from "@/lib/data/use-lender-relationship";
import { formatDate } from "@/lib/format-date";

const STATUS_OPTIONS = (Object.entries(PARTNER_STATUS_LABEL) as [PartnerStatus, string][]).map(([value, label]) => ({ value, label }));
const inputCls = "w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary";
const labelCls = "mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground";

export function LenderRelationshipPanel({ lenderId, canEdit, actorId }: { lenderId: string; canEdit: boolean; actorId: string | null }) {
  const rel = useLenderRelationship(lenderId);
  const invalidate = useInvalidateLender();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: "", role: "", email: "", phone: "", notes: "" });

  const run = async (key: string, fn: () => Promise<void>, fallback: string) => {
    setBusy(key); setError(null);
    try { await fn(); invalidate(lenderId); } catch (e) { setError(errorMessage(e, fallback)); } finally { setBusy(null); }
  };
  const data = rel.data;

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-foreground">Relationship</h3>
        {rel.isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>
      {rel.error && <p role="alert" className="mt-1 text-xs text-status-danger">Could not load the relationship.</p>}
      {data && (
        <>
          <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
            <div>
              <span className={labelCls}>Partner status</span>
              {canEdit ? (
                <OpsSelect value={data.partnerStatus} onValueChange={(v) => void run("status", () => setPartnerStatus(lenderId, v as PartnerStatus), "Could not change the partner status.")} options={STATUS_OPTIONS} aria-label="Partner status" />
              ) : <p className="text-foreground">{PARTNER_STATUS_LABEL[data.partnerStatus]}</p>}
            </div>
            <div>
              <span className={labelCls}>Last contact</span>
              <p className="text-foreground">{data.lastContactAt ? formatDate(data.lastContactAt) : "Not recorded"}</p>
              {canEdit && <button type="button" disabled={busy !== null} onClick={() => void run("log", () => logLenderContact(lenderId), "Could not record the contact.")} className="mt-1 text-[11px] font-semibold text-primary hover:underline disabled:opacity-60">We spoke today</button>}
            </div>
          </div>

          <div className="mt-3">
            <span className={labelCls}>Contacts</span>
            {data.contacts.length === 0 && <p className="text-xs text-muted-foreground">No contacts recorded.</p>}
            <ul className="divide-y divide-border/60">
              {data.contacts.map((c) => (
                <li key={c.id} className="flex flex-wrap items-start justify-between gap-2 py-2 text-xs">
                  <div>
                    <p className="font-semibold text-foreground">{c.name}{c.role && <span className="font-normal text-muted-foreground"> · {c.role}</span>}</p>
                    <p className="text-[11px] text-muted-foreground">{[c.email, c.phone].filter(Boolean).join(" · ") || "No contact details"}{c.notes && ` · ${c.notes}`}</p>
                  </div>
                  <div className="text-right">
                    {c.verifiedAt ? <span className="inline-flex items-center gap-1 text-[11px] text-status-success"><ShieldCheck className="h-3.5 w-3.5" /> Verified {formatDate(c.verifiedAt)}</span>
                      : canEdit && actorId ? <button type="button" disabled={busy !== null} onClick={() => void run(`verify:${c.id}`, () => verifyLenderContact(c.id, actorId), "Could not verify the contact.")} className="text-[11px] font-semibold text-primary hover:underline disabled:opacity-60">Mark verified</button>
                      : <span className="text-[11px] text-muted-foreground">Unverified</span>}
                  </div>
                </li>
              ))}
            </ul>
            {canEdit && actorId && !adding && <button type="button" onClick={() => setAdding(true)} className="mt-1 inline-flex items-center gap-1 rounded-lg border border-primary/40 px-2 py-1 text-[11px] font-bold text-primary hover:bg-primary/10"><Plus className="h-3.5 w-3.5" /> Add contact</button>}
            {canEdit && actorId && adding && (
              <form className="mt-2 grid gap-2 rounded-lg border border-border bg-background p-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); if (!f.name.trim()) return; void run("add", () => addLenderContact({ lenderId, name: f.name.trim(), role: f.role.trim() || null, email: f.email.trim() || null, phone: f.phone.trim() || null, notes: f.notes.trim() || null, actorId }), "Could not add the contact.").then(() => { setAdding(false); setF({ name: "", role: "", email: "", phone: "", notes: "" }); }); }}>
                <label className="block"><span className={labelCls}>Name</span><input value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} className={inputCls} required /></label>
                <label className="block"><span className={labelCls}>Role</span><input value={f.role} onChange={(e) => setF((x) => ({ ...x, role: e.target.value }))} placeholder="BDM, underwriter, ISO manager" className={inputCls} /></label>
                <label className="block"><span className={labelCls}>Email</span><input type="email" value={f.email} onChange={(e) => setF((x) => ({ ...x, email: e.target.value }))} className={inputCls} /></label>
                <label className="block"><span className={labelCls}>Phone</span><input value={f.phone} onChange={(e) => setF((x) => ({ ...x, phone: e.target.value }))} className={inputCls} /></label>
                <label className="block sm:col-span-2"><span className={labelCls}>Notes</span><input value={f.notes} onChange={(e) => setF((x) => ({ ...x, notes: e.target.value }))} className={inputCls} /></label>
                <div className="flex items-center gap-2 sm:col-span-2">
                  <button type="submit" disabled={busy !== null} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">{busy === "add" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Save contact</button>
                  <button type="button" onClick={() => setAdding(false)} className="text-xs font-semibold text-muted-foreground hover:underline">Cancel</button>
                </div>
              </form>
            )}
          </div>
        </>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-status-danger">{error}</p>}
    </div>
  );
}
